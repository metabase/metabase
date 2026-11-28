// PROTOTYPE: picker harness chrome — remove with the prototype
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import "./ProtoPicker.module.css";

const STORAGE_KEY = "proto:metabot-context-tokens";

function readInitialIndex(count: number) {
  const fromUrl = parseInt(
    new URLSearchParams(window.location.search).get("v") ?? "",
    10,
  );
  const fromStorage = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
  const requested = Number.isNaN(fromUrl) ? fromStorage : fromUrl;
  return requested >= 1 && requested <= count ? requested - 1 : 0;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
      target.isContentEditable)
  );
}

/**
 * Active variant index plus a mount key that changes on every switch or
 * replay, so the variant re-mounts and its entrance motion re-runs.
 */
export function useProtoPicker(count: number) {
  const [activeIndex, setActiveIndex] = useState(() => readInitialIndex(count));
  const [mountKey, setMountKey] = useState(0);

  const select = useCallback(
    (index: number) => {
      if (index < 0 || index >= count) {
        return;
      }
      setActiveIndex(index);
      setMountKey((key) => key + 1);
      localStorage.setItem(STORAGE_KEY, String(index + 1));
    },
    [count],
  );

  const replay = useCallback(() => setMountKey((key) => key + 1), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isTypingTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= count) {
        select(num - 1);
      } else if (event.key === "ArrowRight") {
        select((activeIndex + 1) % count);
      } else if (event.key === "ArrowLeft") {
        select((activeIndex - 1 + count) % count);
      } else if (event.key === "r" || event.key === "R") {
        replay();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, count, select, replay]);

  return { activeIndex, mountKey, select, replay };
}

type ProtoPickerProps = {
  names: readonly string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onReplay: () => void;
};

export function ProtoPicker({
  names,
  activeIndex,
  onSelect,
  onReplay,
}: ProtoPickerProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [highlight, setHighlight] = useState({ width: 0, x: 0 });
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    const moveHighlight = () => {
      const item = itemRefs.current[activeIndex];
      if (item) {
        setHighlight({ width: item.offsetWidth, x: item.offsetLeft });
      }
    };
    moveHighlight();
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [activeIndex]);

  // Enable the slide only after first paint, so load doesn't animate.
  useEffect(() => {
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => setIsReady(true));
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, []);

  return createPortal(
    <nav
      className="proto-picker"
      aria-label="Prototype variants"
      data-ready={isReady ? "" : undefined}
    >
      <span
        className="proto-picker-highlight"
        aria-hidden="true"
        style={{
          width: highlight.width,
          transform: `translateX(${highlight.x}px)`,
        }}
      />
      {names.map((name, index) => (
        <button
          key={name}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          className="proto-picker-item"
          data-active={index === activeIndex ? "" : undefined}
          aria-current={index === activeIndex ? "true" : undefined}
          onClick={() => onSelect(index)}
        >
          {name}
        </button>
      ))}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button
        className="proto-picker-item proto-picker-replay"
        aria-label="Replay animation (R)"
        onClick={onReplay}
      >
        {/* eslint-disable-next-line i18next/no-literal-string -- harness chrome, not product UI */}
        ↻
      </button>
    </nav>,
    document.body,
  );
}
