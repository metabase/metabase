import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import "./NavVariantPicker.module.css";
import { PrototypeControls } from "./PrototypeControls";
import { NAV_VARIANTS, useNavVariant } from "./use-nav-variant";

type HighlightStyle = { width: number; transform: string };

/**
 * PROTOTYPE: floating picker for flipping between main-nav variants.
 * Keys: number keys pick a variant, ←/→ step through them.
 */
export function NavVariantPicker() {
  const { variant, setVariant } = useNavVariant();
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>();
  const [isReady, setIsReady] = useState(false);
  const activeIndex = NAV_VARIANTS.findIndex(({ id }) => id === variant);

  const moveHighlight = useCallback(() => {
    const item = itemRefs.current[activeIndex];
    if (item) {
      setHighlightStyle({
        width: item.offsetWidth,
        transform: `translateX(${item.offsetLeft}px)`,
      });
    }
  }, [activeIndex]);

  useLayoutEffect(moveHighlight, [moveHighlight]);

  useEffect(() => {
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [moveHighlight]);

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

  useEffect(() => {
    const count = NAV_VARIANTS.length;
    const selectIndex = (index: number) => setVariant(NAV_VARIANTS[index].id);

    function handleKeyDown(event: KeyboardEvent) {
      const { target } = event;
      const isTyping =
        target instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable);
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const number = parseInt(event.key, 10);
      if (number >= 1 && number <= count) {
        selectIndex(number - 1);
      } else if (event.key === "ArrowRight") {
        selectIndex((activeIndex + 1) % count);
      } else if (event.key === "ArrowLeft") {
        selectIndex((activeIndex - 1 + count) % count);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, setVariant]);

  return (
    <nav
      className="proto-picker"
      aria-label="Prototype variants"
      data-ready={isReady || undefined}
    >
      <span
        className="proto-picker-highlight"
        aria-hidden="true"
        style={highlightStyle}
      />
      {NAV_VARIANTS.map(({ id, label }, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={id}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className="proto-picker-item"
            data-active={isActive || undefined}
            aria-current={isActive || undefined}
            onClick={() => setVariant(id)}
          >
            {label}
          </button>
        );
      })}
      <span className="proto-picker-divider" aria-hidden="true" />
      <PrototypeControls />
    </nav>
  );
}
