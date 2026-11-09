import { useEffect, useState } from "react";
import { GhostBtn, Modal, PrimaryBtn } from "./ui-kit";
import { clearChatImages, clearPureHistory, scanStorage } from "@/lib/storage-actions";
import { formatBytes, LOCKED_BLURB, type StoragePlan } from "@/lib/storage-usage";
import { useApp } from "@/lib/store";

export function StorageBody() {
  const [plan, setPlan] = useState<StoragePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | "chat" | "history" | "locked">(null);

  useEffect(() => {
    let gone = false;
    void scanStorage()
      .then((next) => {
        if (!gone) setPlan(next);
      })
      .catch(() => {
        if (!gone) useApp.getState().toast("没能算完占用");
      });
    return () => {
      gone = true;
    };
  }, []);

  const run = async (job: () => Promise<StoragePlan>, done: string) => {
    setBusy(true);
    setAsk(null);
    try {
      const next = await job();
      setPlan(next);
      useApp.getState().toast(done);
    } catch {
      useApp.getState().toast("清除失败");
    } finally {
      setBusy(false);
    }
  };

  const size = (n: number | undefined) => (plan ? formatBytes(n ?? 0) : "计算中");

  return (
    <>
      <div className="mb-4 text-center">
        <div className="text-[13px] text-muted">总占用</div>
        <div className="text-[28px] font-semibold leading-tight">{plan ? formatBytes(plan.total) : "计算中"}</div>
      </div>
      <UsageRow title="聊天图片" sub={size(plan?.chat)} disabled={!plan || busy} onClick={() => setAsk("chat")} />
      <UsageRow title="纯生图历史" sub={size(plan?.history)} disabled={!plan || busy} onClick={() => setAsk("history")} />
      <UsageRow
        title="不可删除"
        sub={plan ? `${formatBytes(plan.locked)} · ${LOCKED_BLURB}` : "计算中"}
        disabled={!plan || busy}
        onClick={() => setAsk("locked")}
      />
      <Modal open={ask === "chat"} onClose={() => setAsk(null)} title="清除聊天图片">
        <p className="mb-4 text-[13px] text-muted">只删图片文件。提示词和图片框留着。收藏、头像、外貌、背景和表情包不动。</p>
        <div className="flex flex-col gap-2">
          <PrimaryBtn
            disabled={busy || !plan?.keepFirstFree}
            onClick={() => void run(() => clearChatImages("keepFirst"), `已释放 ${formatBytes(plan?.keepFirstFree ?? 0)}`)}
          >
            保留首图 · 释放 {formatBytes(plan?.keepFirstFree ?? 0)}
          </PrimaryBtn>
          <GhostBtn
            className="text-danger"
            disabled={busy || !plan?.dropAllFree}
            onClick={() => void run(() => clearChatImages("all"), `已释放 ${formatBytes(plan?.dropAllFree ?? 0)}`)}
          >
            不保留首图 · 释放 {formatBytes(plan?.dropAllFree ?? 0)}
          </GhostBtn>
          <GhostBtn onClick={() => setAsk(null)}>取消</GhostBtn>
        </div>
      </Modal>
      <Modal open={ask === "history"} onClose={() => setAsk(null)} title="清除纯生图历史">
        <p className="mb-4 text-[13px] text-muted">收藏里的同一张会留下。历史记录会清空。</p>
        <div className="flex flex-col gap-2">
          <PrimaryBtn
            disabled={busy || !plan?.historyRows}
            onClick={() => void run(() => clearPureHistory(), `已释放 ${formatBytes(plan?.historyFree ?? 0)}`)}
          >
            清除 · 释放 {formatBytes(plan?.historyFree ?? 0)}
          </PrimaryBtn>
          <GhostBtn onClick={() => setAsk(null)}>取消</GhostBtn>
        </div>
      </Modal>
      <Modal open={ask === "locked"} onClose={() => setAsk(null)} title="不可删除">
        <div className="flex flex-col">
          {(plan?.parts ?? []).map((part) => (
            <div key={part.label} className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-0">
              <span className="text-[15px]">{part.label}</span>
              <span className="shrink-0 text-[13px] text-muted">{formatBytes(part.bytes)}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function UsageRow({
  title,
  sub,
  onClick,
  disabled,
}: {
  title: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mb-3 flex h-[72px] w-full flex-col justify-center rounded-[18px] border border-line bg-card px-4 text-left active:bg-dim disabled:opacity-60"
    >
      <span className="text-[15px]">{title}</span>
      <span className="truncate text-[13px] text-muted">{sub}</span>
    </button>
  );
}
