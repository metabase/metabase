import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryDragItem } from "../types";

import { ChipNameInput } from "./ChipNameInput";

export type WellChipRename = {
  name: string;
  onRename: (name: string) => void;
};

type WellChipProps = {
  drag: Exclude<SummaryDragItem, { kind: "field" }>;
  children: ReactNode;
  /** Offered on a double-click when set. */
  rename?: WellChipRename;
  onRemove: () => void;
};

export function WellChip({ drag, children, rename, onRemove }: WellChipProps) {
  const { label, key } = drag.item;
  const [isRenaming, setIsRenaming] = useState(false);
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${drag.kind}:${key}`,
    data: drag,
  });

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.chip, { [S.isDragging]: isDragging })}
      data-testid="summary-well-item"
      onDoubleClick={rename ? () => setIsRenaming(true) : undefined}
      {...listeners}
    >
      {rename && isRenaming ? (
        <ChipNameInput
          name={rename.name}
          onRename={rename.onRename}
          onClose={() => setIsRenaming(false)}
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
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}
