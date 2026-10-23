import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Box } from "metabase/ui";

import S from "./FormulaBar.module.css";

// the frame's height transition in FormulaBar.module.css
const FORMULA_BAR_FRAME_TRANSITION_MS = 150;

/**
 * Opens to the formula bar's height while it has a bar and closes when it doesn't. The workspace
 * below moves with it, so the height eases both ways: a closing bar stays in place, without focus
 * or pointer events, until the frame has collapsed over it.
 */
export function FormulaBarFrame({ children }: { children: ReactNode }) {
  const [closingBar, setClosingBar] = useState<ReactNode>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousChildrenRef = useRef(children);
  // outlives the renders the close itself causes; only reopening or unmounting cancels it
  const closeTimeoutRef = useRef<number | undefined>();

  // before paint, so the bar never blinks out ahead of the collapse
  useLayoutEffect(() => {
    const previousChildren = previousChildrenRef.current;
    previousChildrenRef.current = children;
    if (children != null) {
      window.clearTimeout(closeTimeoutRef.current);
      setClosingBar(null);
      return;
    }
    if (previousChildren == null) {
      return;
    }
    const { activeElement } = document;
    if (
      activeElement instanceof HTMLElement &&
      contentRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
    setClosingBar(previousChildren);
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(
      () => setClosingBar(null),
      FORMULA_BAR_FRAME_TRANSITION_MS,
    );
  }, [children]);

  useEffect(() => () => window.clearTimeout(closeTimeoutRef.current), []);

  const isOpen = children != null;
  return (
    <Box className={S.frame} data-open={isOpen || undefined}>
      <Box
        ref={contentRef}
        className={S.frameContent}
        aria-hidden={!isOpen || undefined}
      >
        {children ?? closingBar}
      </Box>
    </Box>
  );
}
