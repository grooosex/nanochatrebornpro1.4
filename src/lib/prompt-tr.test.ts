import assert from "node:assert/strict";
import test from "node:test";
import { tagPromptBody } from "./prompt-tr.ts";

const chat = "grok-4.7-high" as const;

test("跟随配图时用顶栏那一档，不写死模型", () => {
  const body = tagPromptBody({ imageModelId: null, grokModelId: chat }, "雨里的车站");
  assert.equal(body.via, undefined);
  assert.equal(body.grokModelId, chat);
  assert.equal(body.model, undefined);
  assert.equal(body.task, "image");
  assert.equal(body.extraSystem, undefined);
  const messages = body.messages as { role: string; content: string }[];
  assert.equal(messages[1]?.content, "雨里的车站");
  assert.match(messages[0]?.content ?? "", /英文标签/);
});

test("配图选了 Grok 就用那一档", () => {
  const body = tagPromptBody({ imageModelId: "grok-4.5-low", grokModelId: chat }, "a");
  assert.equal(body.via, "grok");
  assert.equal(body.grokModelId, "grok-4.5-low");
});

test("配图选了 API 模型就用那个模型", () => {
  const body = tagPromptBody({ imageModelId: "ds-flash", grokModelId: chat }, "a");
  assert.equal(body.via, "api");
  assert.equal(body.model, "ds-flash");
  assert.equal(body.grokModelId, undefined);
});
