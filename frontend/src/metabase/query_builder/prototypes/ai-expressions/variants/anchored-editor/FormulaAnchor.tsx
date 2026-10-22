import { type ReactNode, useEffect, useState } from "react";
import { useLatest } from "react-use";

import { Box, Popover } from "metabase/ui";

import S from "./SummarySidebar.module.css";

// where the formula editor's completion list renders, outside the panel
const COMPLETION_TOOLTIP_PARENT_ID = "query-builder-tooltip-parent";
const PANEL_WIDTH_PX = 400;
const PANEL_OFFSET_PX = 8;

/** The formula editor floating below a chip, and what a click elsewhere does with it. */
export type FormulaPanel = {
  editor: ReactNode;
  onClickOutside: () => void;
};

type FormulaAnchorProps = {
  panel: FormulaPanel | null | undefined;
  /** The chip the panel hangs from. */
  children: ReactNode;
};

/**
 * Wraps a chip so the formula editor can float centered just below it, in a portal so it's wider
 * than the sidebar. Clicks on the chip, in the panel, or in the editor's completion list don't
 * count as outside clicks.
 */
export function FormulaAnchor({ panel, children }: FormulaAnchorProps) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [dropdown, setDropdown] = useState<HTMLDivElement | null>(null);
  const onClickOutsideRef = useLatest(panel?.onClickOutside);
  const isOpen = panel != null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      const node = event.target;
      if (
        !(node instanceof Node) ||
        target?.contains(node) ||
        dropdown?.contains(node) ||
        document.getElementById(COMPLETION_TOOLTIP_PARENT_ID)?.contains(node)
      ) {
        return;
      }
      onClickOutsideRef.current?.();
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [isOpen, target, dropdown, onClickOutsideRef]);

  return (
    <Popover
      opened={isOpen}
      position="bottom"
      offset={PANEL_OFFSET_PX}
      width={PANEL_WIDTH_PX}
      // the wells' corner, so the panel reads as one of them; its 12px padding leaves 4px inside
      radius="lg"
      closeOnEscape={false}
      closeOnClickOutside={false}
      trapFocus={false}
      returnFocus={false}
    >
      <Popover.Target>
        <Box
          ref={setTarget}
          className={S.formulaAnchor}
          data-open={isOpen || undefined}
        >
          {children}
        </Box>
      </Popover.Target>
      <Popover.Dropdown
        ref={setDropdown}
        className={S.formulaPanel}
        data-testid="summary-formula-panel"
      >
        {panel?.editor}
      </Popover.Dropdown>
    </Popover>
  );
}
