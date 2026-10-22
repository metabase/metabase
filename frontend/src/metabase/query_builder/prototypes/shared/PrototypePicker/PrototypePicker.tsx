import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import S from "./PrototypePicker.module.css";

export type PrototypePickerItem = {
  key: string;
  label: string;
};

type PrototypePickerProps = {
  items: readonly PrototypePickerItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

/**
 * The floating variant switcher from the prototype skill's PICKER.md. Number keys `1–N` and
 * `←`/`→` switch variants unless focus is in an editable element or a modifier is held.
 */
export function PrototypePicker({
  items,
  activeIndex,
  onSelect,
}: PrototypePickerProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const [isReady, setIsReady] = useState(false);

  const moveHighlight = useCallback(() => {
    const item = itemRefs.current[activeIndex];
    const highlight = highlightRef.current;
    if (item == null || highlight == null) {
      return;
    }
    highlight.style.width = `${item.offsetWidth}px`;
    highlight.style.transform = `translateX(${item.offsetLeft}px)`;
  }, [activeIndex]);

  useLayoutEffect(moveHighlight, [moveHighlight]);

  useEffect(() => {
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [moveHighlight]);

  // the highlight slides only after first paint, so its initial position doesn't animate
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setIsReady(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { target } = event;
      const isTyping =
        target instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable);
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const position = parseInt(event.key, 10);
      if (position >= 1 && position <= items.length) {
        onSelect(position - 1);
      } else if (event.key === "ArrowRight") {
        onSelect((activeIndex + 1) % items.length);
      } else if (event.key === "ArrowLeft") {
        onSelect((activeIndex - 1 + items.length) % items.length);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, items.length, onSelect]);

  return (
    <nav
      className={S["proto-picker"]}
      aria-label="Prototype variants"
      data-ready={isReady ? "" : undefined}
    >
      <span
        ref={highlightRef}
        className={S["proto-picker-highlight"]}
        aria-hidden="true"
      />
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={item.key}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            type="button"
            className={S["proto-picker-item"]}
            data-active={isActive ? "" : undefined}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelect(index)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
