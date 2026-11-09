import { db, dropCachedUrl } from "./idb";
import { useApp } from "./store";
import {
  buildStoragePlan,
  collectStorageRefs,
  utf8Bytes,
  type LockedKind,
  type StorageInput,
  type StoragePlan,
} from "./storage-usage";

async function imageSizes() {
  const sizes = new Map<string, number>();
  await db.images.each((row) => {
    sizes.set(row.id, row.blob?.size ?? 0);
  });
  return sizes;
}

function snapshot(): StorageInput & { text: Partial<Record<LockedKind, number>>; historyRows: number } {
  const s = useApp.getState();
  const historyRows = s.history.length;
  return {
    chats: s.chats,
    cards: s.cards,
    favorites: s.favorites,
    history: s.history,
    stickers: s.wechatStickers,
    lookBg: s.settings.look?.bgImageId,
    pureImg: s.pureParams.img2imgBlobId,
    composer: Object.values(s.composerShots).flat(),
    sessions: s.wechatSessions,
    historyRows,
    text: {
      fav: utf8Bytes({ items: s.favorites, groups: s.favGroups }),
      card: utf8Bytes(s.cards),
      role: utf8Bytes(s.chats.map((c) => c.characters)),
      look: utf8Bytes(s.appearances),
      random: utf8Bytes(s.settings.random),
      preset: utf8Bytes({ presets: s.settings.stPresets, sys: s.settings.sysPrompt }),
    },
  };
}

export async function scanStorage(): Promise<StoragePlan> {
  const [sizes, historyRows] = await Promise.all([imageSizes(), db.history.toArray()]);
  const snap = snapshot();
  const refs = collectStorageRefs({ ...snap, history: historyRows });
  return buildStoragePlan(refs, sizes, snap.text, historyRows.length);
}

async function deleteBlobs(ids: string[]) {
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    for (const id of part) dropCachedUrl(id);
    await db.images.bulkDelete(part);
  }
}

export async function clearChatImages(mode: "keepFirst" | "all") {
  const plan = await scanStorage();
  const ids = mode === "keepFirst" ? plan.keepFirstIds : plan.dropAllIds;
  await deleteBlobs(ids);
  if (mode === "all") {
    const gone = new Set(ids);
    for (const chat of useApp.getState().chats) {
      if (chat.avatarBlobId && gone.has(chat.avatarBlobId)) {
        useApp.getState().patchChat(chat.id, { avatarBlobId: undefined });
      }
    }
  }
  return scanStorage();
}

export async function clearPureHistory() {
  const plan = await scanStorage();
  await db.history.clear();
  useApp.setState({ history: [] });
  await deleteBlobs(plan.historyIds);
  return scanStorage();
}
