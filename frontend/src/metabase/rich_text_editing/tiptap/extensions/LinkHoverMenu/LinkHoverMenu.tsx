import type { Editor } from "@tiptap/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import ExternalLink from "metabase/common/components/ExternalLink";
import { ActionIcon, Box, Card, FixedSizeIcon, Flex } from "metabase/ui";

import S from "../PlainLink/PlainLink.module.css";

const HOVER_TIMEOUT_MS = 200;
const MAX_W = 480;

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
      if (target.tagName === "A" && target.classList.contains(S.plainLink)) {
        clearHoverTimeout();
        setHoveredLink(target);
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "A" && target.classList.contains(S.plainLink)) {
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

  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!hoveredLink) {
      return;
    }
    const linkRect = hoveredLink.getBoundingClientRect();
    const editorRect = editor.view.dom.getBoundingClientRect();
    const hoverMenuRect = ref.current?.getBoundingClientRect();

    const leftMax = editorRect.width - (hoverMenuRect?.width ?? MAX_W);
    setHoverPosition({
      top: linkRect.bottom - editorRect.top,
      left: Math.min(linkRect.left - editorRect.left, leftMax),
    });
  }, [hoveredLink, editor]);

  const href = hoveredLink?.getAttribute("href");
  if (!href || !hoveredLink) {
    return null;
  }

  return (
    <Box
      ref={ref}
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
        maw={MAX_W}
      >
        <Flex align="center">
          <Ellipsified showTooltip={false}>
            <ExternalLink href={href} target="_blank">
              {href}
            </ExternalLink>
          </Ellipsified>
          {editable && (
            <ActionIcon
              ml="sm"
              c="text-secondary"
              onClick={() => {
                editor.commands.focus();
                const pos = editor.view.posAtDOM(hoveredLink, 0);
                editor.commands.setTextSelection({
                  from: pos,
                  to: pos + (hoveredLink.textContent?.length || 0),
                });
                editor.emit("openLinkEditor", href);
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
