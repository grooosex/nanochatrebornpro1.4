import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStoragePlan, collectStorageRefs, formatBytes, type StorageInput } from "./storage-usage.ts";

function plan(input: StorageInput, sizes: Record<string, number>, historyRows?: number) {
  const refs = collectStorageRefs(input);
  return buildStoragePlan(refs, new Map(Object.entries(sizes)), {}, historyRows);
}

describe("storage usage", () => {
  it("keeps the first generated image and uploads when keeping the cover", () => {
    const input: StorageInput = {
      chats: [
        {
          id: "c1",
          avatarBlobId: "g1",
          messages: [
            { userImages: [{ blobId: "up" }] },
            { images: [{ blobId: "g1" }, { blobId: "g2" }] },
          ],
        },
      ],
    };
    const p = plan(input, { g1: 10, g2: 20, up: 5, orphan: 7 });
    assert.equal(p.chat, 42);
    assert.deepEqual(p.keepFirstIds.sort(), ["g2", "orphan"]);
    assert.equal(p.keepFirstFree, 27);
    assert.equal(p.dropAllFree, 42);
    assert.deepEqual(p.dropAllIds.sort(), ["g1", "g2", "orphan", "up"]);
  });

  it("keeps the list avatar even when a later picture replaced the first", () => {
    const p = plan(
      {
        chats: [
          {
            id: "c1",
            avatarBlobId: "old",
            messages: [{ images: [{ blobId: "g1" }, { blobId: "g2" }] }],
          },
        ],
      },
      { old: 4, g1: 10, g2: 8 },
    );
    assert.equal(p.keepFirstIds.includes("old"), false);
    assert.equal(p.keepFirstIds.includes("g1"), false);
    assert.deepEqual(p.keepFirstIds, ["g2"]);
  });

  it("never plans favorites, cards, looks, stickers, or backgrounds for deletion", () => {
    const input: StorageInput = {
      favorites: [{ blobId: "fav", params: { img2imgBlobId: "ref" } }],
      cards: [{ customAvatarBlobId: "card", characters: [{ lookBlobId: "look", wechatAvatarBlobId: "wx" }] }],
      stickers: [{ blobId: "stk" }],
      lookBg: "bg",
      chats: [
        {
          id: "c1",
          customAvatarBlobId: "me",
          messages: [{ images: [{ blobId: "fav" }, { blobId: "g1" }] }],
        },
      ],
      history: [{ blobId: "fav" }, { blobId: "hist" }],
    };
    const p = plan(input, { fav: 30, ref: 3, card: 4, look: 5, wx: 6, stk: 7, bg: 8, me: 9, g1: 11, hist: 12 }, 2);
    assert.equal(p.dropAllIds.includes("fav"), false);
    assert.equal(p.historyIds.includes("fav"), false);
    assert.deepEqual(p.historyIds, ["hist"]);
    assert.deepEqual(p.dropAllIds, ["g1"]);
    assert.equal(p.historyFree, 12);
    assert.equal(p.locked, 30 + 3 + 4 + 5 + 6 + 7 + 8 + 9);
    assert.equal(p.parts.find((x) => x.label === "收藏")?.bytes, 33);
    assert.equal(p.parts.find((x) => x.label === "外貌")?.bytes, 5);
    assert.equal(p.parts.find((x) => x.label === "表情包")?.bytes, 7);
  });

  it("reports zero when there are no images", () => {
    const p = plan({ chats: [{ id: "c1", messages: [{ images: [] }] }] }, {});
    assert.equal(p.total, 0);
    assert.equal(p.keepFirstFree, 0);
    assert.equal(p.parts.length, 9);
  });

  it("formats sizes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1536), "1.50 KiB");
    assert.equal(formatBytes(1.62 * 1024 * 1024), "1.62 MiB");
  });
});
