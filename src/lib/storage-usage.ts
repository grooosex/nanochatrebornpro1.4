export type LockedKind =
  | "fav"
  | "card"
  | "role"
  | "look"
  | "avatar"
  | "bg"
  | "sticker"
  | "random"
  | "preset"
  | "ref"
  | "hold";

export const LOCKED_PARTS: { kind: LockedKind; label: string }[] = [
  { kind: "fav", label: "收藏" },
  { kind: "card", label: "角色卡" },
  { kind: "role", label: "角色" },
  { kind: "look", label: "外貌" },
  { kind: "avatar", label: "头像" },
  { kind: "bg", label: "背景" },
  { kind: "sticker", label: "表情包" },
  { kind: "random", label: "随机模块" },
  { kind: "preset", label: "预设" },
];

const EXTRA_PARTS: { kind: LockedKind; label: string }[] = [
  { kind: "ref", label: "参考图" },
  { kind: "hold", label: "待发送" },
];

export const LOCKED_BLURB = "收藏、角色卡、角色、外貌、头像、背景、表情包、随机模块、预设";

type Line = {
  attachments?: { blobId?: string; kind?: string }[];
  images?: { blobId?: string }[];
  gen?: { blobId?: string };
};

type Room = { lines?: Line[]; pending?: { blobId?: string }[] };

export type StorageInput = {
  chats?: StorageChat[];
  cards?: StorageCard[];
  favorites?: { blobId?: string; params?: { img2imgBlobId?: string } }[];
  history?: { blobId?: string }[];
  stickers?: { blobId?: string }[];
  lookBg?: string;
  pureImg?: string;
  composer?: { blobId?: string }[];
  sessions?: Record<string, Room & { rooms?: Record<string, Room> }>;
};

type StorageMsg = {
  images?: { blobId?: string }[];
  userImages?: { blobId?: string }[];
  userImageBlobId?: string;
  wechatLog?: Room & { rooms?: Record<string, Room> };
};

type StorageFork = { active: number; versions: { messages: StorageMsg[] }[] };

type StorageChat = {
  id: string;
  avatarBlobId?: string;
  customAvatarBlobId?: string;
  bgImageId?: string;
  imageParams?: { img2imgBlobId?: string };
  characters?: { lookBlobId?: string; wechatAvatarBlobId?: string }[];
  messages?: StorageMsg[];
  forks?: Record<string, StorageFork>;
};

type StorageCard = {
  customAvatarBlobId?: string;
  characters?: { lookBlobId?: string; wechatAvatarBlobId?: string }[];
};

export type StorageRefs = {
  locked: Map<string, LockedKind>;
  chatGen: Set<string>;
  chatFirst: Set<string>;
  chatUser: Set<string>;
  history: Set<string>;
};

export type StoragePart = { label: string; bytes: number };

export type StoragePlan = {
  total: number;
  chat: number;
  history: number;
  locked: number;
  keepFirstFree: number;
  dropAllFree: number;
  historyFree: number;
  historyRows: number;
  keepFirstIds: string[];
  dropAllIds: string[];
  historyIds: string[];
  parts: StoragePart[];
};

function claim(acc: Acc, id: string | undefined, kind: LockedKind) {
  if (!id || acc.locked.has(id)) return;
  acc.locked.set(id, kind);
  acc.chatGen.delete(id);
  acc.chatFirst.delete(id);
  acc.chatUser.delete(id);
}

function walkRoom(acc: Acc, chatId: string, room: Room | undefined, pendingKind: LockedKind) {
  if (!room) return;
  for (const line of room.lines ?? []) {
    for (const att of line.attachments ?? []) {
      if (att.kind === "sticker") claim(acc, att.blobId, "sticker");
      else noteUser(acc, att.blobId);
    }
    for (const img of line.images ?? []) noteGen(acc, chatId, img.blobId);
    noteGen(acc, chatId, line.gen?.blobId);
  }
  for (const item of room.pending ?? []) claim(acc, item.blobId, pendingKind);
}

function walkHidden(acc: Acc, chatId: string, forks?: StorageFork) {
  if (!forks) return;
  forks.versions.forEach((version, i) => {
    if (i === forks.active) return;
    for (const m of version.messages) {
      if (m.userImageBlobId) noteUser(acc, m.userImageBlobId);
      for (const shot of m.userImages ?? []) noteUser(acc, shot.blobId);
      for (const img of m.images ?? []) noteGen(acc, chatId, img.blobId);
      walkRoom(acc, chatId, m.wechatLog, "hold");
      for (const room of Object.values(m.wechatLog?.rooms ?? {})) walkRoom(acc, chatId, room, "hold");
    }
  });
}

function noteGen(acc: Acc, chatId: string, blobId?: string) {
  if (!blobId || acc.locked.has(blobId) || acc.chatUser.has(blobId)) return;
  if (!acc.firstSeen.has(chatId)) {
    acc.firstSeen.add(chatId);
    acc.chatFirst.add(blobId);
    acc.chatGen.delete(blobId);
    return;
  }
  if (acc.chatFirst.has(blobId)) return;
  acc.chatGen.add(blobId);
}

function noteUser(acc: Acc, blobId?: string) {
  if (!blobId || acc.locked.has(blobId)) return;
  acc.chatUser.add(blobId);
  acc.chatGen.delete(blobId);
  acc.chatFirst.delete(blobId);
}

type Acc = StorageRefs & { firstSeen: Set<string> };

export function collectStorageRefs(input: StorageInput): StorageRefs {
  const acc: Acc = {
    locked: new Map(),
    chatGen: new Set(),
    chatFirst: new Set(),
    chatUser: new Set(),
    history: new Set(),
    firstSeen: new Set(),
  };

  for (const fav of input.favorites ?? []) {
    claim(acc, fav.blobId, "fav");
    claim(acc, fav.params?.img2imgBlobId, "fav");
  }
  for (const card of input.cards ?? []) {
    claim(acc, card.customAvatarBlobId, "avatar");
    for (const c of card.characters ?? []) {
      claim(acc, c.lookBlobId, "look");
      claim(acc, c.wechatAvatarBlobId, "avatar");
    }
  }
  for (const chat of input.chats ?? []) {
    claim(acc, chat.customAvatarBlobId, "avatar");
    claim(acc, chat.bgImageId, "bg");
    claim(acc, chat.imageParams?.img2imgBlobId, "ref");
    for (const c of chat.characters ?? []) {
      claim(acc, c.lookBlobId, "look");
      claim(acc, c.wechatAvatarBlobId, "avatar");
    }
  }
  claim(acc, input.lookBg, "bg");
  claim(acc, input.pureImg, "ref");
  for (const sticker of input.stickers ?? []) claim(acc, sticker.blobId, "sticker");
  for (const shot of input.composer ?? []) claim(acc, shot.blobId, "hold");

  for (const chat of input.chats ?? []) {
    for (const m of chat.messages ?? []) {
      if (m.userImageBlobId) noteUser(acc, m.userImageBlobId);
      for (const shot of m.userImages ?? []) noteUser(acc, shot.blobId);
      for (const img of m.images ?? []) noteGen(acc, chat.id, img.blobId);
      walkRoom(acc, chat.id, m.wechatLog, "hold");
      for (const room of Object.values(m.wechatLog?.rooms ?? {})) walkRoom(acc, chat.id, room, "hold");
    }
    for (const forks of Object.values(chat.forks ?? {})) walkHidden(acc, chat.id, forks);
    const session = input.sessions?.[chat.id];
    if (session) {
      walkRoom(acc, chat.id, session, "hold");
      for (const room of Object.values(session.rooms ?? {})) walkRoom(acc, chat.id, room, "hold");
    }
    const avatar = chat.avatarBlobId;
    if (avatar && !acc.locked.has(avatar) && !acc.chatUser.has(avatar)) {
      acc.chatFirst.add(avatar);
      acc.chatGen.delete(avatar);
      acc.firstSeen.add(chat.id);
    }
  }

  const seenChats = new Set((input.chats ?? []).map((c) => c.id));
  for (const [id, session] of Object.entries(input.sessions ?? {})) {
    if (seenChats.has(id)) continue;
    walkRoom(acc, id, session, "hold");
    for (const room of Object.values(session.rooms ?? {})) walkRoom(acc, id, room, "hold");
  }

  for (const row of input.history ?? []) {
    if (row.blobId) acc.history.add(row.blobId);
  }
  return acc;
}

export function utf8Bytes(value: unknown) {
  if (value == null) return 0;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export function buildStoragePlan(
  refs: StorageRefs,
  sizes: Map<string, number>,
  text: Partial<Record<LockedKind, number>> = {},
  historyRows = refs.history.size,
): StoragePlan {
  const partBytes = new Map<LockedKind, number>();
  for (const [kind, n] of Object.entries(text) as [LockedKind, number][]) {
    if (n > 0) partBytes.set(kind, (partBytes.get(kind) ?? 0) + n);
  }
  let chat = 0;
  let history = 0;
  const keepFirstIds: string[] = [];
  const dropAllIds: string[] = [];
  const historyIds: string[] = [];
  let keepFirstFree = 0;
  let dropAllFree = 0;
  let historyFree = 0;

  const inChat = (id: string) => refs.chatGen.has(id) || refs.chatFirst.has(id) || refs.chatUser.has(id);

  for (const [id, bytes] of sizes) {
    const kind = refs.locked.get(id);
    if (kind) {
      partBytes.set(kind, (partBytes.get(kind) ?? 0) + bytes);
      continue;
    }
    if (inChat(id)) {
      chat += bytes;
      dropAllIds.push(id);
      dropAllFree += bytes;
      if (!refs.chatFirst.has(id) && !refs.chatUser.has(id)) {
        keepFirstIds.push(id);
        keepFirstFree += bytes;
      }
      continue;
    }
    if (refs.history.has(id)) {
      history += bytes;
      historyIds.push(id);
      historyFree += bytes;
      continue;
    }
    chat += bytes;
    dropAllIds.push(id);
    dropAllFree += bytes;
    keepFirstIds.push(id);
    keepFirstFree += bytes;
  }

  const parts: StoragePart[] = LOCKED_PARTS.map((p) => ({ label: p.label, bytes: partBytes.get(p.kind) ?? 0 }));
  for (const extra of EXTRA_PARTS) {
    const bytes = partBytes.get(extra.kind) ?? 0;
    if (bytes > 0) parts.push({ label: extra.label, bytes });
  }
  const locked = parts.reduce((sum, p) => sum + p.bytes, 0);
  return {
    total: chat + history + locked,
    chat,
    history,
    locked,
    keepFirstFree,
    dropAllFree,
    historyFree,
    historyRows,
    keepFirstIds,
    dropAllIds,
    historyIds,
    parts,
  };
}
