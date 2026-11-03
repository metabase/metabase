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
  const isOpen = children != null;
  // the bar last open, still shown while the frame collapses over it
  const [lastBar, setLastBar] = useState<ReactNode>(children);
  const [isClosing, setIsClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // updated while rendering rather than in an effect, so the closing bar is the open bar's own
  // element and keeps its instance: a remounted editor would show its initial text and refocus
  if (isOpen && children !== lastBar) {
    setLastBar(children);
    setIsClosing(false);
  } else if (!isOpen && lastBar != null && !isClosing) {
    setIsClosing(true);
  }

  // before paint, so focus never stays in a bar that's going away
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

  // only reopening or unmounting cancels the collapse, not the renders that happen during it
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
    <Box className={S.frame} data-open={isOpen || undefined}>
      <Box
        ref={contentRef}
        className={S.frameContent}
        aria-hidden={!isOpen || undefined}
        // nothing in a closing bar can take focus
        inert={!isOpen || undefined}
      >
        {children ?? lastBar}
      </Box>
    </Box>
  );
}
