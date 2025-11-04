import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";

import ExternalLink from "metabase/common/components/ExternalLink";
import { ActionIcon, Box, Card, FixedSizeIcon, Flex } from "metabase/ui";
import { PLAIN_LINK_CLASS } from "metabase-enterprise/documents/components/Editor/constants";

const HOVER_TIMEOUT_MS = 150;

interface LinkHoverMenuProps {
  editor: Editor;
  editable: boolean;
}

export const LinkHoverMenu = ({ editor, editable }: LinkHoverMenuProps) => {
  const [hoverPosition, setHoverPosition] = useState({ top: 0, left: 0 });
  const [hoveredLink, setHoveredLink] = useState<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const startHoverTimeout = useCallback(() => {
    clearHoverTimeout();
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredLink(null);
    }, HOVER_TIMEOUT_MS);
  }, [clearHoverTimeout]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "A" &&
        target.classList.contains(PLAIN_LINK_CLASS)
      ) {
        const targetRect = target.getBoundingClientRect();
        const editorRect = editor.view.dom.getBoundingClientRect();
        clearHoverTimeout();
        setHoverPosition({
          top: targetRect.bottom - editorRect.top,
          left: targetRect.left - editorRect.left,
        });
        setHoveredLink(target);
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "A" &&
        target.classList.contains(PLAIN_LINK_CLASS)
      ) {
        startHoverTimeout();
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("mouseover", handleMouseOver);
    editorElement.addEventListener("mouseout", handleMouseOut);

    return () => {
      editorElement.removeEventListener("mouseover", handleMouseOver);
      editorElement.removeEventListener("mouseout", handleMouseOut);
      clearHoverTimeout();
    };
  }, [clearHoverTimeout, editor, startHoverTimeout]);

  const href = hoveredLink?.getAttribute("href");
  if (!href || !hoveredLink) {
    return null;
  }

  return (
    <Box
      mt="xs"
      ml="-sm"
      pos="absolute"
      style={hoverPosition}
      onMouseEnter={() => clearHoverTimeout()}
      onMouseLeave={() => startHoverTimeout()}
    >
      <Card
        shadow="0 2px 8px var(--mb-color-shadow)"
        bd="1px solid var(--mb-color-border)"
        bdrs="sm"
        px="sm"
        py="xs"
      >
        <Flex align="center">
          <ExternalLink href={href}>{href}</ExternalLink>
          {editable && (
            <ActionIcon
              ml="sm"
              onClick={() => {
                editor.commands.focus();
                const pos = editor.view.posAtDOM(hoveredLink, 0);
                editor.commands.setTextSelection({
                  from: pos,
                  to: pos + (hoveredLink.textContent?.length || 0),
                });
                editor.emit("openLinkPopup", true);
                setHoveredLink(null);
              }}
            >
              <FixedSizeIcon name="pencil" />
            </ActionIcon>
          )}
        </Flex>
      </Card>
    </Box>
  );
};
