import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryDragItem } from "../types";

type WellChipProps = {
  drag: Exclude<SummaryDragItem, { kind: "field" }>;
  children: ReactNode;
  onRemove: () => void;
};

export function WellChip({ drag, children, onRemove }: WellChipProps) {
  const { label, key } = drag.item;
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${drag.kind}:${key}`,
    data: drag,
  });

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.chip, { [S.isDragging]: isDragging })}
      data-testid="summary-well-item"
      {...listeners}
    >
      {children}
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
