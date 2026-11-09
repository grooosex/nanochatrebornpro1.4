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
        const scale = vv.scale || 1;
        const zooming = Math.abs(scale - 1) > 0.01 || Math.abs(vv.offsetLeft) > 1;
        const keyboard = !zooming && window.innerHeight - vv.height > 120;
        if (!keyboard) {
          el.style.position = "";
          el.style.left = "";
          el.style.right = "";
          el.style.top = "";
          el.style.height = "";
          el.style.transform = "";
          return;
        }
        el.style.position = "fixed";
        el.style.left = "0";
        el.style.right = "0";
        el.style.top = "0";
        el.style.height = `${vv.height}px`;
        el.style.transform = vv.offsetTop > 0 ? `translate3d(0, ${vv.offsetTop}px, 0)` : "";
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
    <div ref={ref} className="h-[100dvh] overflow-hidden bg-bg">
      <App />
    </div>
  );
}