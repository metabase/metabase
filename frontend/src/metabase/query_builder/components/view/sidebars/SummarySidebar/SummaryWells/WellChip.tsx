import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryDragItem } from "../types";

import { ChipNameInput } from "./ChipNameInput";
import { useWellFieldRef } from "./SummaryWell";

export type WellChipRename = {
  name: string;
  onRename: (name: string) => void;
};

type WellChipProps = {
  drag: Exclude<SummaryDragItem, { kind: "field" }>;
  children: ReactNode;
  /** Offered on a double-click, or F2 from a control of the chip, when set. */
  rename?: WellChipRename;
  /** True while the chip's formula is open in the formula bar. */
  isSelected?: boolean;
  onRemove: () => void;
};

export function WellChip({
  drag,
  children,
  rename,
  isSelected = false,
  onRemove,
}: WellChipProps) {
  const { label, key } = drag.item;
  const wellFieldRef = useWellFieldRef();
  const [isRenaming, setIsRenaming] = useState(false);
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${drag.kind}:${key}`,
    data: drag,
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "F2") {
      event.preventDefault();
      setIsRenaming(true);
    }
  };

  const handleRenameClose = (moveFocus: boolean) => {
    setIsRenaming(false);
    if (moveFocus) {
      wellFieldRef?.current?.focus();
    }
  };

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.chip, {
        [S.isDragging]: isDragging,
        [S.isSelected]: isSelected || isRenaming,
      })}
      data-testid="summary-well-item"
      {...listeners}
      onDoubleClick={rename ? () => setIsRenaming(true) : undefined}
      onKeyDown={rename ? handleKeyDown : undefined}
    >
      {rename && isRenaming ? (
        <ChipNameInput
          name={rename.name}
          onRename={rename.onRename}
          onClose={handleRenameClose}
        />
      ) : (
        children
      )}
      <ActionIcon
        className={S.chipRemove}
        size="sm"
        variant="subtle"
        c="inherit"
        aria-label={t`Remove ${label}`}
        // keeps an open name field from renaming the chip before the click removes it
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}
