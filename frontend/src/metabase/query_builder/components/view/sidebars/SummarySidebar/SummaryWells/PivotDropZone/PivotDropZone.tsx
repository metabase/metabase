import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { t } from "ttag";

import { Box, Flex, Icon } from "metabase/ui";

import S from "./PivotDropZone.module.css";

type PivotDropZoneProps = {
  canDrop: boolean;
};

export function PivotDropZone({ canDrop }: PivotDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "pivot-drop-zone",
    data: { wellId: "rows" },
    disabled: !canDrop,
  });

  return (
    <Box
      ref={setNodeRef}
      className={S.zone}
      data-testid="summary-pivot-drop-zone"
    >
      {canDrop && (
        <Flex className={cx(S.target, { [S.isOver]: isOver })}>
          <Icon name="pivot_table" />
          {t`Create pivot`}
        </Flex>
      )}
    </Box>
  );
}
