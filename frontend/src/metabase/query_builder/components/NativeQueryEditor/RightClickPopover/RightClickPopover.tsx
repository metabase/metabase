import { useCallback, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { Flex, Icon, Popover } from "metabase/ui";

import RightClickPopoverS from "./RightClickPopover.module.css";

interface RightClickPopoverProps {
  isOpen: boolean;
  canSaveSnippets: boolean;
  target: () => Element | null | undefined;
  runQuery?: () => void;
  openSnippetModalWithSelectedText?: () => void;
}

export const RightClickPopover = ({
  isOpen,
  target,
  runQuery,
  openSnippetModalWithSelectedText,
  canSaveSnippets,
}: RightClickPopoverProps) => {
  const [position, setPosition] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const element = target();
      if (element) {
        setPosition(element.getBoundingClientRect());
      }
    };

    updatePosition();

    // Update position on scroll/resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, target]);

  const setAnchorRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && position) {
        node.style.position = "fixed";
        node.style.left = `${position.left}px`;
        node.style.top = `${position.bottom}px`;
        node.style.width = `${position.width}px`;
        node.style.height = "0";
        node.style.pointerEvents = "none";
      }
    },
    [position],
  );

  if (!isOpen || !position) {
    return null;
  }

  return createPortal(
    <Popover opened position="bottom-start" withinPortal={false}>
      <Popover.Target>
        <div ref={setAnchorRef} />
      </Popover.Target>
      <Popover.Dropdown data-testid="popover">
        <Flex direction="column">
          {runQuery && (
            <a className={RightClickPopoverS.Anchor} onClick={runQuery}>
              <Icon mr="sm" name="play" size={16} />
              <h4>{t`Run selection`}</h4>
            </a>
          )}
          {canSaveSnippets && openSnippetModalWithSelectedText && (
            <a
              className={RightClickPopoverS.Anchor}
              onClick={openSnippetModalWithSelectedText}
            >
              <Icon mr="sm" name="snippet" size={16} />
              <h4>{t`Save as snippet`}</h4>
            </a>
          )}
        </Flex>
      </Popover.Dropdown>
    </Popover>,
    document.body,
  );
};
