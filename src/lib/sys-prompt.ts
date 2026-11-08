import type { SysPromptPatch } from "./types.ts";

export const SYS = {
  chatWrite: "chat-write",
  chatStruct: "chat-struct",
  chatGroup: "chat-group",
  chatOpen: "chat-open",
  chatStatus: "chat-status",
  chatLove: "chat-love",
  chatImgWriter: "chat-img-writer",
  chatImgShot: "chat-img-shot",
  chatImgBg: "chat-img-bg",
  chatImgMulti: "chat-img-multi",
  chatImgLen: "chat-img-len",
  chatImgOrder: "chat-img-order",
  wxReply: "wx-reply",
  wxGroup: "wx-group",
  wxPrivate: "wx-private",
  wxFold: "wx-fold",
  wxSum: "wx-sum",
  wxImgWriter: "wx-img-writer",
  wxImgShot: "wx-img-shot",
  wxImgBg: "wx-img-bg",
  wxImgMulti: "wx-img-multi",
  wxImgHere: "wx-img-here",
  wxImgLen: "wx-img-len",
  wxImgOrder: "wx-img-order",
  polishAll: "polish-all",
  polishField: "polish-field",
  polishVoice: "polish-voice",
  memoryBody: "memory-body",
} as const;

const PAIR = new Set<string>([SYS.chatWrite, SYS.chatStruct]);

type AppLike = {
  getState: () => {
    settings: { sysPrompt?: Record<string, SysPromptPatch> };
    setSettings: (p: { sysPrompt?: Record<string, SysPromptPatch> }) => void;
  };
};

let appOf: (() => AppLike) | null = null;
let baselinesOf: (() => Record<string, string>) | null = null;

export function bindSysApp(fn: () => AppLike) {
  appOf = fn;
}

export function bindSysBaselines(fn: () => Record<string, string>) {
  baselinesOf = fn;
}

function hashText(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h << 5) + h ^ text.charCodeAt(i);
  return (h >>> 0).toString(16);
}

export function sourceHash(id: string) {
  const text = baselinesOf?.()[id];
  return typeof text === "string" ? hashText(text) : "";
}

export function sysTextEdited(id: string) {
  return typeof sysPatches()[id]?.text === "string";
}

export function sysDrifted(id: string) {
  const patch = sysPatches()[id];
  if (typeof patch?.text !== "string" || typeof patch.base !== "string") return false;
  const hash = sourceHash(id);
  return hash !== "" && patch.base !== hash;
}

export function sysPatches(): Record<string, SysPromptPatch> {
  return appOf?.().getState().settings.sysPrompt ?? {};
}

export function customText(id: string) {
  const text = sysPatches()[id]?.text;
  return typeof text === "string" ? text : undefined;
}

export function edited(id: string, original: string): string {
  const text = sysPatches()[id]?.text;
  return typeof text === "string" ? text : original;
}

export function turnedOff(id: string): boolean {
  return sysPatches()[id]?.off === true;
}

function commit(id: string, patch: SysPromptPatch) {
  const app = appOf?.();
  if (!app) return;
  const next = { ...sysPatches() };
  const row = { ...patch };
  if (row.text === undefined) {
    delete row.base;
    delete row.kept;
  }
  if (row.text === undefined && row.force === undefined && !row.off) delete next[id];
  else next[id] = row;
  app.getState().setSettings({ sysPrompt: Object.keys(next).length ? next : undefined });
}

export function saveSysText(id: string, text: string, baseline: string) {
  const prev = { ...(sysPatches()[id] ?? {}) };
  if (text === baseline) {
    delete prev.text;
    delete prev.base;
    delete prev.kept;
  } else {
    prev.text = text;
    const hash = sourceHash(id);
    if (hash) prev.base = hash;
    else delete prev.base;
    delete prev.kept;
  }
  commit(id, prev);
}

/** 老存档改过但没有指纹。打开时盖上当前指纹，不弹窗。 */
export function stampSysHashes() {
  const app = appOf?.();
  if (!app) return;
  const cur = sysPatches();
  let changed = false;
  const next = { ...cur };
  for (const [id, patch] of Object.entries(cur)) {
    if (typeof patch.text !== "string" || typeof patch.base === "string") continue;
    const hash = sourceHash(id);
    if (!hash) continue;
    next[id] = { ...patch, base: hash };
    changed = true;
  }
  if (changed) app.getState().setSettings({ sysPrompt: next });
}

export function keepSysVersions(ids: string[]) {
  const app = appOf?.();
  if (!app) return;
  const next = { ...sysPatches() };
  for (const id of ids) {
    const patch = next[id];
    if (patch && typeof patch.text === "string") next[id] = { ...patch, kept: true };
  }
  app.getState().setSettings({ sysPrompt: Object.keys(next).length ? next : undefined });
}

/** 丢掉改过的正文，开关留着。 */
export function syncSysTexts(ids: string[]) {
  const app = appOf?.();
  if (!app) return;
  const next = { ...sysPatches() };
  for (const id of ids) {
    const row = { ...(next[id] ?? {}) };
    delete row.text;
    delete row.base;
    delete row.kept;
    if (row.force === undefined && !row.off) delete next[id];
    else next[id] = row;
  }
  app.getState().setSettings({ sysPrompt: Object.keys(next).length ? next : undefined });
}

export function toggleSysOff(id: string) {
  const prev = { ...(sysPatches()[id] ?? {}) };
  if (prev.off) delete prev.off;
  else prev.off = true;
  commit(id, prev);
}

export function resetSys(ids: string[]) {
  const app = appOf?.();
  if (!app) return;
  const next = { ...sysPatches() };
  for (const id of ids) delete next[id];
  app.getState().setSettings({ sysPrompt: Object.keys(next).length ? next : undefined });
}

export function pairAuto(hasStyle: boolean, id: string) {
  return id === SYS.chatStruct ? hasStyle : !hasStyle;
}

export function pairOn(hasStyle: boolean, id: string) {
  const force = sysPatches()[id]?.force;
  if (typeof force === "boolean") return force;
  return pairAuto(hasStyle, id);
}

export function togglePair(hasStyle: boolean, id: string) {
  const nextOn = !pairOn(hasStyle, id);
  const prev = { ...(sysPatches()[id] ?? {}) };
  if (nextOn === pairAuto(hasStyle, id)) delete prev.force;
  else prev.force = nextOn;
  commit(id, prev);
}

export function pairNote(hasStyle: boolean) {
  const touched = PAIR.has(SYS.chatWrite) && (typeof sysPatches()[SYS.chatWrite]?.force === "boolean" || typeof sysPatches()[SYS.chatStruct]?.force === "boolean");
  const write = pairOn(hasStyle, SYS.chatWrite);
  const struct = pairOn(hasStyle, SYS.chatStruct);
  const what = write && struct ? "两段都发" : !write && !struct ? "两段都不发" : write ? "只用聊天写法" : "只用结构规则";
  return touched ? `你改过了：${what}` : `跟着预设：${struct ? "用结构规则" : "用聊天写法"}`;
}

/** 没改过时，和原来二选一的结果逐字一样。 */
export function resolveChatBase(hasStyle: boolean, structure: string, write: string) {
  const w = sysPatches()[SYS.chatWrite];
  const s = sysPatches()[SYS.chatStruct];
  const touched = typeof w?.force === "boolean" || typeof s?.force === "boolean" || typeof w?.text === "string" || typeof s?.text === "string";
  if (!touched) return hasStyle ? structure : write;
  const parts: string[] = [];
  if (pairOn(hasStyle, SYS.chatWrite)) parts.push(typeof w?.text === "string" ? w.text : write);
  if (pairOn(hasStyle, SYS.chatStruct)) parts.push(typeof s?.text === "string" ? s.text : structure);
  return parts.join("\n\n");
}

/** 正文可改。结尾从标记起原样接上，关了就整段不发。没改过时和 full 逐字一样。 */
export function withKeptCloser(id: string, full: string, mark: string) {
  const at = full.lastIndexOf(mark);
  if (at < 0) {
    if (turnedOff(id)) return "";
    return edited(id, full);
  }
  if (turnedOff(id)) return "";
  const body = full.slice(0, at);
  const next = edited(id, body);
  if (next === body) return full;
  return `${next}${full.slice(at)}`;
}

export function closerText(full: string, mark: string) {
  const at = full.lastIndexOf(mark);
  if (at < 0) return "";
  return full.slice(at + mark.length);
}
