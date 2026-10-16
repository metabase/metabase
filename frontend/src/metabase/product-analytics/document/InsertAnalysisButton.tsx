import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { type RefObject, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon, Popover, Text } from "metabase/ui";

import type { AnalysisKind } from "../spec/types";

import { AnalysisGallery } from "./AnalysisGallery";

const BUTTON_OFFSET_PX = 40;
const POPOVER_WIDTH_PX = 640;

type EmptyLine = {
  /** Relative to the container. */
  top: number;
  left: number;
  cursorPos: number;
};

const getEmptyLine = (
  editor: Editor,
  container: HTMLElement | null,
): EmptyLine | null => {
  const { selection } = editor.state;
  const { $from } = selection;
  const isOnEmptyLine =
    selection.empty &&
    $from.depth === 1 &&
    $from.parent.type.name === "paragraph" &&
    $from.parent.content.size === 0;
  if (
    container === null ||
    !editor.isEditable ||
    !editor.isFocused ||
    editor.isEmpty ||
    !isOnEmptyLine
  ) {
    return null;
  }
  const coords = editor.view.coordsAtPos($from.pos);
  const rect = container.getBoundingClientRect();
  return {
    top: coords.top - rect.top,
    left: coords.left - rect.left - BUTTON_OFFSET_PX,
    cursorPos: $from.pos,
  };
};

type InsertAnalysisButtonProps = {
  editor: Editor;
  /** Positioned, and wrapping the editor. */
  containerRef: RefObject<HTMLElement>;
  isDisabled: boolean;
  onSelect: (kind: AnalysisKind) => void;
};

/** A "+" next to the empty line the cursor is on, for adding an analysis there. */
export const InsertAnalysisButton = ({
  editor,
  containerRef,
  isDisabled,
  onSelect,
}: InsertAnalysisButtonProps) => {
  const emptyLine = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor !== null ? getEmptyLine(editor, containerRef.current) : null,
  });
  // Choosing an analysis moves focus off the editor, which hides the line.
  const [openedAt, setOpenedAt] = useState<EmptyLine | null>(null);
  const line = openedAt ?? emptyLine;

  if (line === null) {
    return null;
  }

  const handleSelect = (kind: AnalysisKind) => {
    editor.commands.setTextSelection(line.cursorPos);
    setOpenedAt(null);
    onSelect(kind);
  };

  return (
    <Box pos="absolute" top={line.top} left={line.left}>
      <Popover
        opened={openedAt !== null}
        position="bottom-start"
        width={POPOVER_WIDTH_PX}
        onChange={(isOpened) => setOpenedAt(isOpened ? line : null)}
      >
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            aria-label={t`Add an analysis`}
            // Keep the editor's focus, so the line stays put until the popover opens.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpenedAt(openedAt === null ? line : null)}
          >
            <Icon name="add" />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown p="md">
          <Text fw="bold" mb="sm">{t`Add an analysis`}</Text>
          <AnalysisGallery
            isDisabled={isDisabled}
            isCompact
            onSelect={handleSelect}
          />
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};
