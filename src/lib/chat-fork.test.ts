import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hiddenForkText, liveText, mapForkMessages, parkFork, switchFork } from "./chat-fork.ts";
import type { Chat, ChatMessage } from "./types.ts";

function love(n: number) {
  return `正文\n💞好感度:${n}[📈+1Ⅰ信任]\n「在意。」`;
}

function msg(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, images: [], createdAt: 0, characterId: role === "assistant" ? "a" : undefined };
}

function chat(messages: ChatMessage[], affections: Record<string, number>): Chat {
  return {
    id: "c",
    messages,
    characters: [{ id: "a", name: "言叶", extras: [], imageEnabled: true, prompt: "", uc: "", x: 0, y: 0, persona: "", speech: "", appearance: "" }],
    affections,
    memory: "后来掉到八十",
    memoryUntil: 4,
    memoryFoldAt: 4,
    memorySnaps: [
      { covered: 2, text: "早期一百", foldAt: 2 },
      { covered: 4, text: "后来掉到八十", foldAt: 4 },
    ],
  } as unknown as Chat;
}

describe("chat forks", () => {
  it("keeps the covered reply off the live chat and rewinds affection", () => {
    const before = chat(
      [msg("u1", "user", "第一句"), msg("a100", "assistant", love(100)), msg("u2", "user", "后来"), msg("a82", "assistant", love(82))],
      { a: 82 },
    );
    const parked = parkFork(before, 3);
    assert.equal(parked.messages.map((m) => m.id).join(","), "u1,a100,u2");
    assert.equal(parked.affections?.a, 100);
    assert.equal(parked.memory, "早期一百");
    assert.equal(liveText(parked).includes("82"), false);
    assert.match(hiddenForkText(parked), /好感度:82/);
    assert.equal(hiddenForkText(parked).includes("第一句"), false);
    assert.equal(parked.forks?.u2?.versions.length, 2);
    assert.equal(parked.forks?.u2?.versions[0].memory, "后来掉到八十");
    assert.equal(parked.forks?.u2?.versions[0].affections?.a, 82);
  });

  it("switches the reply and the affection without mixing branches", () => {
    let cur = chat(
      [msg("u1", "user", "第一句"), msg("a100", "assistant", love(100)), msg("u2", "user", "后来"), msg("a82", "assistant", love(82))],
      { a: 82 },
    );
    cur = parkFork(cur, 3);
    cur = { ...cur, messages: [...cur.messages, msg("aNew", "assistant", love(101))] };
    const back = switchFork(cur, "u2", -1);
    assert.equal(back.messages.some((m) => m.id === "a82"), true);
    assert.equal(back.messages.some((m) => m.id === "aNew"), false);
    assert.equal(back.affections?.a, 82);
    assert.equal(liveText(back).includes("好感度:101"), false);
    assert.match(hiddenForkText(back), /好感度:101/);
    const forward = switchFork(back, "u2", 1);
    assert.equal(forward.messages.some((m) => m.id === "aNew"), true);
    assert.equal(forward.messages.some((m) => m.id === "a82"), false);
    assert.equal(liveText(forward).includes("好感度:82"), false);
  });

  it("overwrites a failed reply instead of keeping it as another branch", () => {
    let cur = chat(
      [msg("u1", "user", "第一句"), msg("a100", "assistant", love(100)), msg("u2", "user", "后来"), msg("a82", "assistant", love(82))],
      { a: 82 },
    );
    cur = parkFork(cur, 3);
    cur = { ...cur, messages: [...cur.messages, msg("bad", "assistant", "（回复失败）network error")] };
    const again = parkFork(cur, cur.messages.findIndex((m) => m.id === "bad"));
    assert.equal(again.forks?.u2?.versions.length, 2);
    assert.equal(again.messages.some((m) => m.id === "bad"), false);
    assert.equal(again.forks?.u2?.active, 1);
    const fresh = parkFork(chat([msg("u", "user", "问"), msg("bad", "assistant", "（回复失败）network error")], { a: 1 }), 1);
    assert.equal(fresh.forks, undefined);
    assert.equal(fresh.messages.some((m) => m.content.includes("回复失败")), false);
  });

  it("keeps an in-progress reply on its own branch while another is on screen", () => {
    let cur = chat(
      [msg("u1", "user", "第一句"), msg("a100", "assistant", love(100)), msg("u2", "user", "后来"), msg("a82", "assistant", love(82))],
      { a: 82 },
    );
    cur = parkFork(cur, 3);
    cur = { ...cur, messages: [...cur.messages, msg("hold", "assistant", "")] };
    const away = switchFork(cur, "u2", -1);
    assert.equal(away.messages.some((m) => m.id === "hold"), false);
    const version = away.forks?.u2?.versions.findIndex((v) => v.messages.some((m) => m.id === "hold")) ?? -1;
    assert.equal(version, 1);
    const written = mapForkMessages(away, { anchorId: "u2", version }, (messages) =>
      messages.map((m) => (m.id === "hold" ? { ...m, content: "写了一半" } : m)),
    );
    assert.equal(liveText(written).includes("写了一半"), false);
    const back = switchFork(written, "u2", 1);
    assert.match(liveText(back), /写了一半/);
    assert.equal(back.messages.some((m) => m.id === "a82"), false);
  });
});
