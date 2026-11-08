import type { CharacterPrompt, ImageParams } from "./types";
import { supportsChars } from "./nai";

const NUL = "\0";
const CHAR_CAP = 6;

export type SlotFields = Pick<ImageParams, "promptFront" | "promptMid" | "promptBack" | "negative">;

function joinPieces(base: string, pieces: string[]) {
  let out = base.trim();
  for (const piece of pieces) {
    if (!piece) continue;
    out = out ? `${out.replace(/,\s*$/, "")}, ${piece}` : piece;
  }
  return out;
}

function placeAround(base: string, pre: string[], post: string[]) {
  if (!pre.length && !post.length) return base;
  const head = joinPieces("", pre);
  const body = base.trim();
  return joinPieces(body ? joinPieces(head, [body]) : head, post);
}

/** 去掉被抽走的标签，顺手收掉多余逗号和空格。 */
export function tidySlots(text: string) {
  let out = text;
  while (out.includes(NUL)) {
    const at = out.indexOf(NUL);
    let left = out.slice(0, at).replace(/[ \t]+$/g, "");
    let right = out.slice(at + 1).replace(/^[ \t]+/g, "");
    const leftComma = /,\s*$/.test(left);
    const rightComma = /^,/.test(right);
    if (leftComma && rightComma) {
      left = left.replace(/,\s*$/, "");
      right = right.replace(/^,\s*/, "");
      out = left && right ? `${left}, ${right}` : left + right;
    } else if (leftComma) out = left.replace(/,\s*$/, "") + right;
    else if (rightComma) out = left + right.replace(/^,\s*/, "");
    else out = left && right ? `${left} ${right}` : left + right;
  }
  return out;
}

function blankCard(index: number): CharacterPrompt {
  return { id: `auto_c${index + 1}`, name: `角色${index + 1}`, enabled: false, prompt: "", uc: "", x: 0.5, y: 0.5 };
}

/** 随机开着时，把 <正1前> <负后> <角色N> 从四个栏里挪走。只改这一份，不写回参数。 */
export function applyPromptSlots(params: ImageParams, fields: SlotFields, fillMissing: boolean) {
  const buckets = {
    front: { pre: [] as string[], post: [] as string[] },
    mid: { pre: [] as string[], post: [] as string[] },
    back: { pre: [] as string[], post: [] as string[] },
    neg: { pre: [] as string[], post: [] as string[] },
  };
  const place = (text: string) =>
    tidySlots(
      text.replace(/<(正\s*([123])?|负)\s*(前|后)\s*[:：]\s*([^>]*)>/g, (full, kind: string, num: string | undefined, side: string, body: string) => {
        if (kind !== "负" && !num && !params.merged) return full;
        const piece = body.trim();
        if (!piece) return NUL;
        const dest = kind === "负" ? "neg" : params.merged ? "mid" : num === "1" ? "front" : num === "2" ? "mid" : "back";
        (side === "前" ? buckets[dest].pre : buckets[dest].post).push(piece);
        return NUL;
      }),
    );
  const placed: SlotFields = {
    promptFront: place(fields.promptFront || ""),
    promptMid: place(fields.promptMid || ""),
    promptBack: place(fields.promptBack || ""),
    negative: place(fields.negative || ""),
  };
  const moved: SlotFields = {
    promptFront: placeAround(placed.promptFront, buckets.front.pre, buckets.front.post),
    promptMid: placeAround(placed.promptMid, buckets.mid.pre, buckets.mid.post),
    promptBack: placeAround(placed.promptBack, buckets.back.pre, buckets.back.post),
    negative: placeAround(placed.negative, buckets.neg.pre, buckets.neg.post),
  };

  const charsOn = supportsChars(params.model);
  const cap = fillMissing && charsOn ? CHAR_CAP : params.characters.length;
  const prompts = Array.from({ length: cap }, () => [] as string[]);
  const ucs = Array.from({ length: cap }, () => [] as string[]);
  const charMissing: number[] = [];
  const take = (text: string, into: string[][]) =>
    tidySlots(
      text.replace(/<角色\s*(\d+)\s*[:：]\s*([^>]*)>>?/g, (_full, raw: string, body: string) => {
        const n = Number(raw);
        const piece = body.trim();
        if (!piece) return NUL;
        const idx = n - 1;
        if (!charsOn || !Number.isInteger(n) || idx < 0 || idx >= cap) {
          if (Number.isInteger(n) && n >= 0 && !charMissing.includes(n)) charMissing.push(n);
          return piece;
        }
        into[idx].push(piece);
        return NUL;
      }),
    );
  const front = take(moved.promptFront, prompts);
  const mid = take(moved.promptMid, prompts);
  const back = take(moved.promptBack, prompts);
  const negative = take(moved.negative, ucs);
  let highest = -1;
  for (let i = 0; i < cap; i++) if (prompts[i].length || ucs[i].length) highest = i;
  const count = fillMissing && charsOn ? Math.max(params.characters.length, highest + 1) : params.characters.length;
  const characters = Array.from({ length: count }, (_, i) => {
    const prev = params.characters[i] ?? blankCard(i);
    const add = prompts[i] ?? [];
    const addUc = ucs[i] ?? [];
    const fillGap = fillMissing && charsOn && i <= highest;
    if (!add.length && !addUc.length && !fillGap) return prev;
    return {
      ...prev,
      enabled: true,
      prompt: add.length ? joinPieces(prev.prompt, add) : prev.prompt,
      uc: addUc.length ? joinPieces(prev.uc, addUc) : prev.uc,
    };
  });
  return {
    params: { ...params, promptFront: front, promptMid: mid, promptBack: back, negative, characters },
    charMissing,
  };
}
