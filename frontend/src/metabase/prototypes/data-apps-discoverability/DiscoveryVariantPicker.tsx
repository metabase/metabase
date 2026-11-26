import { useEffect, useLayoutEffect, useRef, useState } from "react";

import "./picker.module.css";
import { PrototypeControls } from "./PrototypeControls";
import {
  DISCOVERY_VARIANTS,
  GUIDE_LAYOUTS,
  useDiscoveryVariant,
  useGuideLayout,
} from "./use-discovery-variant";

type HighlightStyle = { width: number; transform: string };

interface PickerGroupProps<Id extends string> {
  items: readonly { id: Id; label: string }[];
  activeId: Id;
  onSelect: (id: Id) => void;
}

/** One set of mutually exclusive picker items, with its own sliding highlight. */
function PickerGroup<Id extends string>({
  items,
  activeId,
  onSelect,
}: PickerGroupProps<Id>) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>();
  const activeIndex = items.findIndex(({ id }) => id === activeId);

  useLayoutEffect(() => {
    function moveHighlight() {
      const item = itemRefs.current[activeIndex];
      if (item) {
        setHighlightStyle({
          width: item.offsetWidth,
          transform: `translateX(${item.offsetLeft}px)`,
        });
      }
    }
    moveHighlight();
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [activeIndex]);

  return (
    <>
      <span
        className="proto-picker-highlight"
        aria-hidden="true"
        style={highlightStyle}
      />
      {items.map(({ id, label }, index) => {
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
            onClick={() => onSelect(id)}
          >
            {label}
          </button>
        );
      })}
    </>
  );
}

/**
 * PROTOTYPE: floating picker over the real app, with two groups: where data apps are discovered, and how the
 * `/data-apps` guide page is laid out.
 * Keys: number keys pick an item across both groups, ←/→ step through the entry points.
 */
export function DiscoveryVariantPicker() {
  const { variant, setVariant } = useDiscoveryVariant();
  const { layout, setLayout } = useGuideLayout();
  const [isReady, setIsReady] = useState(false);

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
    const variantCount = DISCOVERY_VARIANTS.length;
    const activeIndex = DISCOVERY_VARIANTS.findIndex(
      ({ id }) => id === variant,
    );

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
      const pickedVariant = DISCOVERY_VARIANTS[number - 1];
      const pickedLayout = GUIDE_LAYOUTS[number - 1 - variantCount];
      if (pickedVariant) {
        setVariant(pickedVariant.id);
      } else if (pickedLayout) {
        setLayout(pickedLayout.id);
      } else if (event.key === "ArrowRight") {
        setVariant(DISCOVERY_VARIANTS[(activeIndex + 1) % variantCount].id);
      } else if (event.key === "ArrowLeft") {
        setVariant(
          DISCOVERY_VARIANTS[(activeIndex - 1 + variantCount) % variantCount]
            .id,
        );
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [variant, setVariant, setLayout]);

  return (
    <nav
      className="proto-picker"
      aria-label="Prototype variants"
      data-ready={isReady || undefined}
    >
      <PickerGroup
        items={DISCOVERY_VARIANTS}
        activeId={variant}
        onSelect={setVariant}
      />
      <span className="proto-picker-divider" aria-hidden="true" />
      <PickerGroup
        items={GUIDE_LAYOUTS}
        activeId={layout}
        onSelect={setLayout}
      />
      <span className="proto-picker-divider" aria-hidden="true" />
      <PrototypeControls />
    </nav>
  );
}
