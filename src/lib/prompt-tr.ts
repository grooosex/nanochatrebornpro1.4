import { useSyncExternalStore } from "react";
import { imageWriteFields, resolveImageWrite } from "./image-ai";
import { grokOnce } from "./grok-client";
import { isMostlyChinese } from "./prompt-groups";
import { useApp } from "./store";
import { translateText } from "./translate";
import type { GrokModelId } from "./types";

const TAG_SYSTEM = "你把用户写的画面写成 NovelAI 提示词。只输出逗号分隔的英文标签，不要解释，不要引号。";

export function tagPromptBody(
  settings: { imageModelId?: string | null; grokModelId: GrokModelId },
  text: string,
): Record<string, unknown> {
  const dest = resolveImageWrite(settings.imageModelId);
  const body: Record<string, unknown> = {
    task: "image",
    max_tokens: 400,
    messages: [
      { role: "system", content: TAG_SYSTEM },
      { role: "user", content: text },
    ],
    ...imageWriteFields(settings.imageModelId),
  };
  if (!dest.split) body.grokModelId = settings.grokModelId;
  return body;
}

type TrKind = "literal" | "tags";

let busy: TrKind | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePromptTrBusy() {
  return useSyncExternalStore(subscribe, () => busy, () => null);
}

export function runPromptTr(kind: TrKind) {
  if (busy) return;
  const settings = useApp.getState().settings;
  const src = (settings.promptTrSrc ?? "").trim();
  if (!src) return;
  busy = kind;
  emit();
  const task =
    kind === "literal"
      ? translateText(src, isMostlyChinese(src) ? "en" : "zh")
      : grokOnce(tagPromptBody(settings, src)).then((text) => text.trim());
  void task
    .then((text) => {
      useApp.getState().setSettings({ promptTrOut: text });
    })
    .catch((err: unknown) => {
      useApp.getState().toast(err instanceof Error ? err.message : "翻译失败");
    })
    .finally(() => {
      busy = null;
      emit();
    });
}
