import assert from "node:assert/strict";
import test from "node:test";
import { glossBody, groupAt, isMostlyChinese, promptSegments, replaceWeightBody, weightOf } from "./prompt-groups.ts";

const live = () => false;

test("commas inside a weight still split", () => {
  const shown = "1.5::full body,foot::, solo";
  const segs = promptSegments(shown, live);
  assert.equal(segs.map((seg) => seg.text).join(""), shown);
  assert.deepEqual(
    segs.filter((seg) => seg.kind === "text").map((seg) => [seg.body, seg.weight]),
    [
      ["full body", "up"],
      ["foot", "up"],
      ["solo", "none"],
    ],
  );
  assert.equal(weightOf("1.5::full body,foot::"), "up");
  assert.equal(weightOf("0.5::hat::"), "down");
  assert.equal(weightOf("-2::hat::"), "neg");
  assert.equal(weightOf("{smile}"), "up");
  assert.equal(weightOf("[smile]"), "down");
  assert.equal(glossBody("-2::hat::"), "hat");
});

test("a live random tag is not split as a prompt group", () => {
  const shown = 'solo, <ran_id="角色"&"动作">\u2003\u2003, hat';
  const segs = promptSegments(shown, (names) => names.includes("角色") && names.includes("动作"));
  assert.equal(segs.map((seg) => seg.text).join(""), shown);
  assert.equal(segs.some((seg) => seg.kind === "ran"), true);
  assert.equal(segs.some((seg) => seg.kind === "slot"), true);
  const hat = groupAt(segs, shown.length);
  assert.equal(hat?.seg.body, "hat");
});

test("negative and weaken colors follow the weight, not the word", () => {
  const neg = promptSegments("-2::hat, coat::", live).filter((seg) => seg.kind === "text");
  assert.deepEqual(
    neg.map((seg) => [seg.body, seg.weight]),
    [
      ["hat", "neg"],
      ["coat", "neg"],
    ],
  );
  const down = promptSegments("0.5::dress::, 1::plain::", live).filter((seg) => seg.kind === "text" && seg.body.trim());
  assert.deepEqual(
    down.flatMap((seg) => (seg.kind === "text" ? [[seg.body, seg.weight]] : [])),
    [
      ["dress", "down"],
      ["plain", "none"],
    ],
  );
});
test("chinese replaces inside a weight and plain text stays around it", () => {
  assert.equal(isMostlyChinese("一个女孩在看书"), true);
  assert.equal(isMostlyChinese("1girl, solo"), false);
  assert.equal(replaceWeightBody("1.5::黑丝::", "black pantyhose"), "1.5::black pantyhose::");
  assert.equal(replaceWeightBody(" 黑丝", "black pantyhose"), " black pantyhose");
});
