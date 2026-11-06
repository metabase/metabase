import cx from "classnames";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Box } from "metabase/ui";

import S from "./FormulaBarFrame.module.css";

const FORMULA_BAR_FRAME_TRANSITION_MS = 150;

/** Keeps the closing editor mounted until its frame has collapsed. */
export function FormulaBarFrame({ children }: { children: ReactNode }) {
  const isOpen = children != null;
  const [lastBar, setLastBar] = useState<ReactNode>(children);
  const [isClosing, setIsClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Preserve the editor instance during collapse. A remount resets its text and focus.
  if (isOpen && children !== lastBar) {
    setLastBar(children);
    setIsClosing(false);
  } else if (!isOpen && lastBar != null && !isClosing) {
    setIsClosing(true);
  }

  useLayoutEffect(() => {
    const { activeElement } = document;
    if (
      isClosing &&
      activeElement instanceof HTMLElement &&
      contentRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }, [isClosing]);

  useEffect(() => {
    if (!isClosing) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setIsClosing(false);
      setLastBar(null);
    }, FORMULA_BAR_FRAME_TRANSITION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isClosing]);

  return (
    <Box className={cx(S.frame, { [S.open]: isOpen })}>
      <Box
        ref={contentRef}
        className={S.frameContent}
        aria-hidden={!isOpen || undefined}
        inert={!isOpen || undefined}
      >
        {children ?? lastBar}
      </Box>
    </Box>
  );
}
