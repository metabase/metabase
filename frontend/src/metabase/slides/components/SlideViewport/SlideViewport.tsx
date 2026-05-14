import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import S from "./SlideViewport.module.css";

const SLIDE_W = 1280;
const SLIDE_H = 720;

/**
 * Wraps SlideContent so every slide renders at a fixed 1280×720 internal canvas
 * and scales to fit whatever container it's in. This is what guarantees the
 * editor preview and the presenter view look identical — both render the same
 * pixel layout, just at different scale factors.
 */
export const SlideViewport = ({ children }: { children: ReactNode }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      setScale(Math.min(rect.width / SLIDE_W, rect.height / SLIDE_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Window resize fallback in case the container's own size doesn't change but
  // the viewport does (e.g. browser zoom)
  useEffect(() => {
    const handler = () => {
      const el = wrapperRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      setScale(Math.min(rect.width / SLIDE_W, rect.height / SLIDE_H));
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div ref={wrapperRef} className={S.viewport}>
      <div className={S.canvas} style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
};
