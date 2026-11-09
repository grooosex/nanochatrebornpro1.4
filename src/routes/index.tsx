import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/components/App";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    let frame = 0;
    const pin = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = vv.offsetTop;
        const keyboard = window.innerHeight - vv.height > 120 || top > 1;
        el.style.height = `${vv.height}px`;
        el.style.transform = keyboard ? `translate3d(0, ${top}px, 0)` : "";
      });
    };
    pin();
    vv.addEventListener("resize", pin);
    vv.addEventListener("scroll", pin);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", pin);
      vv.removeEventListener("scroll", pin);
    };
  }, []);
  return (
    <div ref={ref} className="fixed inset-x-0 top-0 h-[100dvh] overflow-hidden bg-bg">
      <App />
    </div>
  );
}
