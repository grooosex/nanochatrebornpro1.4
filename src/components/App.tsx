import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Menu, SlidersHorizontal } from "lucide-react";
import { emptyCharacter } from "@/lib/constants";
import { loadTags } from "@/lib/tags";
import { listedChats, useApp } from "@/lib/store";
import { isWorkshopChat } from "@/lib/workshop";
import { FIELD_LABELS } from "@/lib/prompts";
import { DEFAULT_STATUS_BAR, defaultImageParams } from "@/lib/constants";
import type { Chat, MultiMode } from "@/lib/types";
import { ACCENT, PAPER, accentTone, readLook } from "@/lib/look";
import { uid } from "@/lib/utils";
import { ChatPane, CustomPromptModal } from "./ChatPane";
import { WechatDock } from "./WechatPane";
import { ConnectionPanel } from "./ConnectionPanel";
import { CardEditSheet } from "./CardEditSheet";
import { AppearEditSheet } from "./AppearEditSheet";
import { ParamsPane } from "./ParamsPane";
import { PurePane } from "./PurePane";
import { RoleEditor } from "./RoleEditor";
import { RenameModal, Sidebar } from "./Sidebar";
import { WorkshopHost } from "./WorkshopHost";
import { ConfirmHost, GhostBtn, IconBtn, Modal, PrimaryBtn, TextArea, TextInput, ToastHost, useMotion } from "./ui-kit";

export function App() {
  const hydrate = useApp((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
    void loadTags();
  }, [hydrate]);
  return <Shell />;
}

function Shell() {
  const tab = useApp((s) => s.ui.tab);
  const creating = useApp((s) => s.ui.creating);
  const editing = useApp((s) => s.ui.editingChatId);
  const currentId = useApp((s) => s.currentId);
  const chat = useApp((s) => s.chats.find((c) => c.id === currentId));
  const editChat = useApp((s) => s.chats.find((c) => c.id === editing));
  const draft = useApp((s) => s.chats.find((c) => c.isDraft && c.id === currentId));
  const theme = useApp((s) => s.settings.theme);
  const motion = useMotion();
  const look = readLook(useApp((s) => s.settings.look));

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (motion && root.dataset.motion === "off") {
      root.querySelectorAll(".fade-in, .rise-in, .pop-in, .pane-from-left, .pane-from-right, .drawer-in, .dim-in").forEach((node) => {
        (node as HTMLElement).style.setProperty("animation", "none", "important");
      });
    }
    root.dataset.motion = motion ? "on" : "off";
  }, [motion]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    const custom = theme !== "dark" && look.paper !== PAPER;
    if (custom) root.style.setProperty("--color-bg", look.paper);
    else root.style.removeProperty("--color-bg");
    if (look.accent !== ACCENT) {
      const tone = accentTone(look.accent);
      root.style.setProperty("--color-primary", tone.solid);
      root.style.setProperty("--color-primary-hover", tone.hover);
      root.style.setProperty("--color-primary-soft", theme === "dark" ? tone.softDark : tone.soft);
    } else {
      root.style.removeProperty("--color-primary");
      root.style.removeProperty("--color-primary-hover");
      root.style.removeProperty("--color-primary-soft");
    }
    const meta = custom ? look.paper : theme === "dark" ? "#1a1714" : "#F3EEE6";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", meta);
  }, [theme, look.paper, look.accent]);

  const realChat = chat && !chat.isDraft ? chat : null;
  const paramsChat = creating && draft ? draft : realChat;
  const chatEditor =
    tab === "chat" && creating && draft ? (
      <RoleEditor chat={draft} mode="create" />
    ) : tab === "chat" && editing && editChat ? (
      <RoleEditor chat={editChat} mode="edit" />
    ) : null;

  return (
    <div className="relative mx-auto flex h-full max-w-lg flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <IconBtn onClick={() => useApp.getState().setUI({ sidebar: true })}>
          <Menu className="size-5" />
        </IconBtn>
        <TabNav />
        <IconBtn onClick={() => useApp.getState().setUI({ connection: true })}>
          <SlidersHorizontal className="size-5" />
        </IconBtn>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <KeptTabs
          tab={tab}
          chat={{
            tick: chatEditor ? "editor" : realChat,
            node: (
              <>
                {chatEditor}
                <div hidden={chatEditor != null} className="h-full">
                  {realChat ? <ChatPane key={realChat.id} chat={realChat} /> : <EmptyChat />}
                </div>
              </>
            ),
          }}
          params={{
            tick: paramsChat,
            node: paramsChat ? <ParamsPane key={paramsChat.id} chat={paramsChat} /> : <EmptyParams />,
          }}
          pure={{ tick: null, node: <PurePane /> }}
        />
        {tab === "chat" && chat && !chat.isDraft && !isWorkshopChat(chat) ? <WechatDock chat={chat} /> : null}
        <Sidebar />
        <WorkshopHost />
        <ConnectionPanel />
        <CardEditSheet />
        <AppearEditSheet />
      </main>

      <ToastHost />
      <ConfirmHost />
      <RenameModal />
      <CustomPromptModal />
      <SaveCardModal />
      <SaveAppearModal />
      <FieldEditModal />
      <MoveModal />
      <MultiCreateModal />
    </div>
  );
}

const TAB_ORDER = ["chat", "params", "pure"] as const;

function KeptTabs({
  tab,
  chat,
  params,
  pure,
}: {
  tab: "chat" | "params" | "pure";
  chat: { tick: unknown; node: ReactNode };
  params: { tick: unknown; node: ReactNode };
  pure: { tick: unknown; node: ReactNode };
}) {
  const motion = useMotion();
  const [seen, setSeen] = useState(tab);
  const [cls, setCls] = useState<string | null>(null);
  const [alive, setAlive] = useState(() => ({ chat: tab === "chat", params: tab === "params", pure: tab === "pure" }));
  if (!alive[tab]) setAlive((s) => (s[tab] ? s : { ...s, [tab]: true }));
  if (!motion && cls) setCls(null);
  if (tab !== seen) {
    setSeen(tab);
    const next = TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(seen) ? "pane-from-right" : "pane-from-left";
    setCls(motion ? next : null);
  }
  const shown = alive[tab] ? alive : { ...alive, [tab]: true };

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("[data-kept-off]")) active.blur();
  });

  const frame = (id: "chat" | "params" | "pure", pane: { tick: unknown; node: ReactNode }) =>
    shown[id] ? <PaneFrame key={id} on={tab === id} cls={motion ? cls : null} tick={pane.tick} node={pane.node} /> : null;

  return (
    <div className="relative h-full">
      {frame("chat", chat)}
      {frame("params", params)}
      {frame("pure", pure)}
    </div>
  );
}

function PaneFrame({ on, cls, tick, node }: { on: boolean; cls: string | null; tick: unknown; node: ReactNode }) {
  return (
    <div
      inert={!on}
      {...(on ? {} : { "data-kept-off": "" })}
      className={on ? `absolute inset-0 ${cls ?? ""}` : "absolute inset-0 invisible pointer-events-none"}
    >
      <Hold freeze={!on} tick={tick}>
        {node}
      </Hold>
    </div>
  );
}

const Hold = memo(function Hold({ freeze, tick, children }: { freeze: boolean; tick: unknown; children: ReactNode }) {
  void freeze;
  void tick;
  return children;
}, (prev, next) => {
  if (prev.freeze && next.freeze) return true;
  if (prev.freeze && !next.freeze) return Object.is(prev.tick, next.tick);
  return false;
});

function TabNav() {
  const motion = useMotion();
  if (!motion) {
    return (
      <nav className="flex flex-1 justify-center gap-7 text-[15px]">
        <TabBtn id="chat" label="聊天" />
        <TabBtn id="params" label="生图参数" />
        <TabBtn id="pure" label="纯生图" />
      </nav>
    );
  }
  return <SlidingTabNav />;
}

function SlidingTabNav() {
  const tab = useApp((s) => s.ui.tab);
  const ref = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  const [slide, setSlide] = useState(false);
  useLayoutEffect(() => {
    const nav = ref.current;
    const btn = nav?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!nav || !btn) return;
    setBar({ left: btn.offsetLeft + 4, width: Math.max(0, btn.offsetWidth - 8) });
  }, [tab]);
  useEffect(() => {
    setSlide(true);
  }, []);
  return (
    <nav ref={ref} className="relative flex flex-1 justify-center gap-7 text-[15px]">
      <TabBtn id="chat" label="聊天" mark={false} />
      <TabBtn id="params" label="生图参数" mark={false} />
      <TabBtn id="pure" label="纯生图" mark={false} />
      {bar ? (
        <span
          className={`pointer-events-none absolute -bottom-0.5 h-[2px] rounded-full bg-ink ${slide ? "transition-[left,width] duration-200 ease-out" : ""}`}
          style={{ left: bar.left, width: bar.width }}
        />
      ) : null}
    </nav>
  );
}

function TabBtn({ id, label, mark = true }: { id: "chat" | "params" | "pure"; label: string; mark?: boolean }) {
  const tab = useApp((s) => s.ui.tab);
  const on = tab === id;
  return (
    <button
      data-tab={id}
      onClick={() => useApp.getState().setTab(id)}
      className={`relative pb-2 ${on ? "font-semibold text-ink" : "text-muted"}`}
    >
      {label}
      {mark && on && <span className="absolute inset-x-1 -bottom-0.5 h-[2px] rounded-full bg-ink" />}
    </button>
  );
}

function EmptyParams() {
  return (
    <p className="px-6 py-16 text-center text-[13px] text-muted">先在侧栏新建一个角色，才能设置聊天配图参数。</p>
  );
}

function EmptyChat() {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div>
        <div className="font-serif text-2xl">还没有开始</div>
        <p className="mt-2 max-w-xs text-[13px] leading-6 text-muted">
          点左上角打开侧栏，新建一个角色就能聊。配图会跟着每句回复出来。
        </p>
        <button
          className="mt-6 rounded-full bg-primary px-6 py-3 text-[14px] text-on-primary"
          onClick={() => useApp.getState().newDraft()}
        >
          新建聊天
        </button>
      </div>
    </div>
  );
}

function SaveCardModal() {
  const open = useApp((s) => s.ui.saveCardOpen);
  const chat = useApp((s) => s.current());
  const [name, setName] = useState(chat?.name ?? "");
  useEffect(() => setName(chat?.name ?? ""), [chat?.name, open]);
  if (!open || !chat) return null;
  const close = () => useApp.getState().setUI({ saveCardOpen: false });
  return (
    <Modal open onClose={close} title="保存为角色卡" hideClose>
      <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="输入名称" autoFocus />
      <div className="mt-4 flex gap-3">
        <GhostBtn onClick={close}>取消</GhostBtn>
        <PrimaryBtn onClick={() => useApp.getState().saveCard(chat, name.trim() || chat.name || "未命名")}>保存</PrimaryBtn>
      </div>
    </Modal>
  );
}

function SaveAppearModal() {
  const ui = useApp((s) => s.ui);
  const tab = useApp((s) => s.ui.tab);
  const chat = useApp((s) => s.current());
  const pure = useApp((s) => s.pureParams);
  const [name, setName] = useState("");
  useEffect(() => setName(""), [ui.saveAppearOpen]);
  if (!ui.saveAppearOpen) return null;
  const close = () => useApp.getState().setUI({ saveAppearOpen: false });
  const prompt =
    tab === "pure"
      ? ui.appearTarget && ui.appearTarget !== "mid"
        ? pure.characters.find((c) => c.id === ui.appearTarget)?.prompt ?? ""
        : pure.promptMid
      : ui.appearTarget && ui.appearTarget !== "mid"
        ? chat?.imageParams.characters.find((c) => c.id === ui.appearTarget)?.prompt ?? ""
        : chat?.imageParams.promptMid ?? "";
  return (
    <Modal open onClose={close} title="保存角色" hideClose>
      <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="输入名称" autoFocus />
      <div className="mt-4 flex gap-3">
        <GhostBtn onClick={close}>取消</GhostBtn>
        <PrimaryBtn disabled={!name.trim()} onClick={() => useApp.getState().saveAppearance(name.trim(), prompt)}>
          保存
        </PrimaryBtn>
      </div>
    </Modal>
  );
}

function FieldEditModal() {
  const field = useApp((s) => s.ui.fieldEdit);
  const [text, setText] = useState(field?.text ?? "");
  useEffect(() => setText(field?.text ?? ""), [field?.text, field?.key, field?.charId]);
  if (!field) return null;
  const isAll = field.key === "all";
  const label = isAll ? "整张卡" : FIELD_LABELS[field.key] || field.key;
  return (
    <Modal open onClose={() => useApp.getState().setUI({ fieldEdit: null })} title={isAll ? "个性化修改整张卡" : `个性化修改 · ${label}`}>
      <TextArea value={text} placeholder="写下你的要求" onChange={(e) => setText(e.target.value)} />
      <PrimaryBtn
        className="mt-4"
        onClick={() => {
          const t = text.trim();
          if (!t) {
            useApp.getState().toast("写一点要求");
            return;
          }
          const live = useApp.getState().current();
          if (!live) return;
          useApp.getState().setUI({
            fieldEdit: null,
            polishJob: {
              chatId: live.id,
              kind: isAll ? "personalize" : "field",
              key: isAll ? undefined : field.key,
              charId: field.charId,
              instruction: t,
            },
          });
        }}
      >
        {isAll ? "按这个改" : "改这一栏"}
      </PrimaryBtn>
    </Modal>
  );
}

function MoveModal() {
  const open = useApp((s) => s.ui.moveOpen);
  const folders = useApp((s) => s.folders);
  const chats = useApp((s) => s.chats);
  const selected = useApp((s) => s.ui.selected);
  if (!open) return null;
  const workshop = selected.some((id) => {
    const chat = chats.find((c) => c.id === id);
    if (chat) return isWorkshopChat(chat);
    return folders.find((f) => f.id === id)?.place === "workshop";
  });
  const { foldersSorted } = listedChats(folders, chats, workshop ? "workshop" : "home");
  return (
    <Modal open onClose={() => useApp.getState().setUI({ moveOpen: false })} title="移动到">
      <button
        className="mb-2 w-full rounded-2xl bg-card px-4 py-3 text-left"
        onClick={() => useApp.getState().moveSelected(null)}
      >
        不放进文件夹
      </button>
      {foldersSorted.map((f) => (
        <button
          key={f.id}
          className="mb-2 w-full rounded-2xl bg-card px-4 py-3 text-left"
          onClick={() => useApp.getState().moveSelected(f.id)}
        >
          {f.name}
        </button>
      ))}
    </Modal>
  );
}

function MultiCreateModal() {
  const ids = useApp((s) => s.ui.multiCreate);
  const chats = useApp((s) => s.chats);
  const [mode, setMode] = useState<MultiMode>("together");
  const [overview, setOverview] = useState("");
  const [opening, setOpening] = useState("");
  if (!ids || ids.length < 2) return null;
  const picked = ids.map((id) => chats.find((c) => c.id === id)).filter(Boolean) as Chat[];

  const makeDraft = (): Chat => {
    const id = uid("chat_");
    const characters = picked.map((c, i) => {
      const src = c.characters[0] ?? emptyCharacter(i + 1);
      return { ...src, id: uid("c_") };
    });
    const imageParams = defaultImageParams();
    imageParams.characters = characters.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: true,
      prompt: c.appearance || c.prompt,
      uc: c.uc,
      x: 0.5,
      y: 0.5,
    }));
    return {
      id,
      folderId: null,
      name: characters.map((c) => c.name).filter(Boolean).join("、"),
      remark: "",
      starred: false,
      order: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDraft: true,
      grokModelId: useApp.getState().settings.grokModelId,
      isMulti: true,
      multiMode: mode,
      promptMode: "insert",
      adultBoost: false,
      canGen: true,
      statusBarOn: false,
      statusBar: DEFAULT_STATUS_BAR,
      overview,
      opening,
      extras: [],
      memory: "",
      memoryUntil: 0,
      memoryFoldAt: 0,
      memorySnaps: [],
      characters,
      imageParams,
      messages: [],
      scrollTop: 0,
    };
  };

  const pushDraft = (draft: Chat) => {
    useApp.setState((s) => ({
      chats: [...s.chats, draft],
      currentId: draft.id,
      ui: { ...s.ui, multiCreate: null, creating: true, sidebar: false, selectMode: false, selected: [], tab: "chat", autoPolish: false },
    }));
  };

  return (
    <Modal open onClose={() => useApp.getState().setUI({ multiCreate: null })} title="请设置多人聊天" wide>
      {picked.map((c, i) => (
        <div key={c.id} className="mb-2 text-[13px]">
          角色{i + 1}：{c.name}
        </div>
      ))}
      <div className="my-3 text-[13px] font-medium">要求总览</div>
      <TextArea value={overview} onChange={(e) => setOverview(e.target.value)} />
      <div className="mb-1 mt-3 text-[13px] font-medium">开场场景</div>
      <TextArea value={opening} onChange={(e) => setOpening(e.target.value)} />
      <div className="my-3 flex gap-2">
        <button
          className={`flex-1 rounded-full py-2 text-[13px] ${mode === "together" ? "bg-primary text-on-primary" : "border border-line"}`}
          onClick={() => setMode("together")}
        >
          多人同聊模式
        </button>
        <button
          className={`flex-1 rounded-full py-2 text-[13px] ${mode === "group" ? "bg-primary text-on-primary" : "border border-line"}`}
          onClick={() => setMode("group")}
        >
          群聊模式
        </button>
      </div>
      <PrimaryBtn
        onClick={() => {
          const draft = makeDraft();
          useApp.setState((s) => ({
            chats: [...s.chats, draft],
            currentId: draft.id,
            ui: { ...s.ui, multiCreate: null, creating: true, sidebar: false, selectMode: false, selected: [], tab: "chat", autoPolish: true },
          }));
        }}
      >
        让 Grok 完善设定
      </PrimaryBtn>
      <GhostBtn
        className="mt-2"
        onClick={async () => {
          const draft = makeDraft();
          pushDraft(draft);
          useApp.getState().commitChat(draft.id);
          const { sendOpening } = await import("./chat-actions");
          void sendOpening(draft.id);
        }}
      >
        跳过，开始聊天
      </GhostBtn>
    </Modal>
  );
}
