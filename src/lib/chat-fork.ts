import { applySnaps, rewindSnaps } from "./chat-memory";
import { affinityUpdates } from "./scene-bar";
import type { Chat, ChatMessage, ForkSet, ForkVersion } from "./types";

type Mem = Pick<Chat, "memory" | "memoryUntil" | "memoryFoldAt" | "memorySnaps">;

function memOf(chat: Chat): Mem {
  return {
    memory: chat.memory || "",
    memoryUntil: chat.memoryUntil || 0,
    memoryFoldAt: chat.memoryFoldAt || 0,
    memorySnaps: chat.memorySnaps || [],
  };
}

function capture(messages: ChatMessage[], affections: Record<string, number> | undefined, mem: Mem): ForkVersion {
  return {
    messages: structuredClone(messages),
    affections: affections ? { ...affections } : undefined,
    memory: mem.memory,
    memoryUntil: mem.memoryUntil,
    memoryFoldAt: mem.memoryFoldAt,
    memorySnaps: structuredClone(mem.memorySnaps || []),
  };
}

export function affectionsFromMessages(chat: Chat, messages: ChatMessage[]) {
  const next: Record<string, number> = {};
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const found = affinityUpdates(m.content);
    if (!found.length) continue;
    if (m.characterId && found.length === 1) {
      next[m.characterId] = found[0].value;
      continue;
    }
    for (const item of found) {
      const who =
        chat.characters.find((c) => c.name && item.name && (item.name === c.name || item.name.includes(c.name))) ??
        (chat.characters.length === 1 ? chat.characters[0] : undefined);
      if (who) next[who.id] = item.value;
    }
  }
  return next;
}

function visible(messages: ChatMessage[]) {
  return messages
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n");
}

export function hiddenForkText(chat: Chat) {
  const chunks: string[] = [];
  for (const forks of Object.values(chat.forks ?? {})) {
    forks.versions.forEach((version, i) => {
      if (i === forks.active) return;
      for (const m of version.messages) {
        if (m.content) chunks.push(m.content);
      }
    });
  }
  return chunks.join("\n");
}

export function liveText(chat: Chat) {
  return visible(chat.messages);
}

function forkKey(anchorId: string | null) {
  return anchorId ?? "";
}

export type ForkSlot = { anchorId: string | null; version: number };

export function failedReply(text: string) {
  return text.trim().startsWith("（回复失败）");
}

function failureSuffix(suffix: ChatMessage[]) {
  if (!suffix.length) return false;
  if (suffix.some((m) => m.role === "user" && (m.content.trim() || m.wechatLog || m.userImages?.length || m.userImageBlobId))) return false;
  const replies = suffix.filter((m) => m.role !== "user");
  return replies.length > 0 && replies.every((m) => failedReply(m.content));
}

export function forkIsLive(chat: Chat, slot?: ForkSlot) {
  if (!slot) return true;
  const set = chat.forks?.[forkKey(slot.anchorId)];
  return !set || set.active === slot.version;
}

/** 这一支正在屏幕上就改 messages，切走了就改它自己存着的那一版。 */
export function mapForkMessages(chat: Chat, slot: ForkSlot | undefined, map: (messages: ChatMessage[]) => ChatMessage[]): Chat {
  if (forkIsLive(chat, slot) || !slot) return { ...chat, messages: map(chat.messages) };
  const key = forkKey(slot.anchorId);
  const set = chat.forks?.[key];
  const version = set?.versions[slot.version];
  if (!set || !version) return { ...chat, messages: map(chat.messages) };
  const versions = set.versions.map((v, i) => (i === slot.version ? { ...v, messages: map(v.messages) } : v));
  return { ...chat, forks: { ...chat.forks, [key]: { ...set, versions } } };
}

export function writeForkAffection(chat: Chat, slot: ForkSlot | undefined, affections: Record<string, number>): Chat {
  if (forkIsLive(chat, slot) || !slot) return { ...chat, affections };
  const key = forkKey(slot.anchorId);
  const set = chat.forks?.[key];
  if (!set?.versions[slot.version]) return chat;
  const versions = set.versions.map((v, i) => (i === slot.version ? { ...v, affections: { ...affections } } : v));
  return { ...chat, forks: { ...chat.forks, [key]: { ...set, versions } } };
}

/** 切走之后，拼出这一支自己的消息，给还在写的请求用。 */
export function branchView(chat: Chat, slot?: ForkSlot): Chat {
  if (!slot || forkIsLive(chat, slot)) return chat;
  const set = chat.forks?.[forkKey(slot.anchorId)];
  const version = set?.versions[slot.version];
  if (!set || !version) return chat;
  const anchorIdx = slot.anchorId ? chat.messages.findIndex((m) => m.id === slot.anchorId) : -1;
  const prefix = slot.anchorId && anchorIdx >= 0 ? chat.messages.slice(0, anchorIdx + 1) : [];
  return {
    ...chat,
    messages: [...prefix, ...version.messages],
    affections: version.affections ? { ...version.affections } : {},
    memory: version.memory,
    memoryUntil: version.memoryUntil,
    memoryFoldAt: version.memoryFoldAt,
    memorySnaps: version.memorySnaps,
  };
}

/** 从 suffixStart 起的消息收成一个新版本。屏幕上只留前面的。好感度和记忆退到前面。 */
export function parkFork(chat: Chat, suffixStart: number): Chat {
  if (suffixStart < 0 || suffixStart > chat.messages.length) return chat;
  const suffix = chat.messages.slice(suffixStart);
  if (!suffix.length) return chat;
  const prefix = chat.messages.slice(0, suffixStart).map((m) => ({ ...m }));
  const anchorId = prefix.length ? prefix[prefix.length - 1].id : null;
  const key = forkKey(anchorId);
  const existing = chat.forks?.[key];
  const prefixMem = applySnaps(rewindSnaps(chat.memorySnaps, prefix.length));
  const prefixAff = affectionsFromMessages(chat, prefix);
  if (failureSuffix(suffix)) {
    return {
      ...chat,
      messages: prefix,
      affections: prefixAff,
      memory: prefixMem.memory,
      memoryUntil: prefixMem.memoryUntil,
      memoryFoldAt: prefixMem.memoryFoldAt,
      memorySnaps: prefixMem.memorySnaps,
    };
  }
  const currentMem = memOf(chat);
  const currentAff = chat.affections ? { ...chat.affections } : undefined;
  const versions = existing?.versions.length
    ? existing.versions.map((v, i) => (i === existing.active ? capture(suffix, currentAff, currentMem) : v))
    : [capture(suffix, currentAff, currentMem)];
  versions.push(capture([], prefixAff, prefixMem));
  const forkSet: ForkSet = { active: versions.length - 1, versions };
  return {
    ...chat,
    messages: prefix,
    affections: prefixAff,
    memory: prefixMem.memory,
    memoryUntil: prefixMem.memoryUntil,
    memoryFoldAt: prefixMem.memoryFoldAt,
    memorySnaps: prefixMem.memorySnaps,
    forks: { ...chat.forks, [key]: forkSet },
  };
}

export function switchFork(chat: Chat, anchorId: string | null, dir: -1 | 1): Chat {
  const key = forkKey(anchorId);
  const forks = chat.forks?.[key];
  if (!forks || forks.versions.length < 2) return chat;
  const anchorIdx = anchorId ? chat.messages.findIndex((m) => m.id === anchorId) : -1;
  if (anchorId && anchorIdx < 0) return chat;
  const nodeStart = anchorId ? anchorIdx + 1 : 0;
  const prefix = chat.messages.slice(0, nodeStart);
  const versions = forks.versions.map((v, i) =>
    i === forks.active ? capture(chat.messages.slice(nodeStart), chat.affections, memOf(chat)) : v,
  );
  const next = (forks.active + dir + versions.length) % versions.length;
  const chosen = versions[next];
  return {
    ...chat,
    messages: [...prefix, ...structuredClone(chosen.messages)],
    affections: chosen.affections ? { ...chosen.affections } : {},
    memory: chosen.memory,
    memoryUntil: chosen.memoryUntil,
    memoryFoldAt: chosen.memoryFoldAt,
    memorySnaps: structuredClone(chosen.memorySnaps),
    forks: { ...chat.forks, [key]: { active: next, versions } },
  };
}

export function forkPager(chat: Chat, msgIndex: number): { anchorId: string | null; index: number; count: number } | null {
  if (msgIndex < 0 || msgIndex >= chat.messages.length) return null;
  const prevId = msgIndex === 0 ? null : chat.messages[msgIndex - 1]?.id;
  if (msgIndex > 0 && !prevId) return null;
  const asNode = chat.forks?.[forkKey(prevId)];
  if (asNode && asNode.versions.length > 1) {
    return { anchorId: prevId, index: asNode.active, count: asNode.versions.length };
  }
  const ownId = chat.messages[msgIndex].id;
  const own = chat.forks?.[ownId];
  if (own && own.versions.length > 1 && !chat.messages[msgIndex + 1]) {
    return { anchorId: ownId, index: own.active, count: own.versions.length };
  }
  return null;
}

function collectInactive(forks: ForkSet | undefined, into: ChatMessage[]) {
  if (!forks) return;
  forks.versions.forEach((version, i) => {
    if (i === forks.active) return;
    into.push(...version.messages);
  });
}

export function inactiveForkMessages(chat: { messages?: ChatMessage[]; forks?: Record<string, ForkSet> }) {
  const into: ChatMessage[] = [];
  for (const forks of Object.values(chat.forks ?? {})) collectInactive(forks, into);
  return into;
}

export function forkTouches(chat: Chat, blobId: string) {
  return inactiveForkMessages(chat).some(
    (m) => m.userImageBlobId === blobId || m.userImages?.some((s) => s.blobId === blobId) || m.images.some((g) => g.blobId === blobId),
  );
}
