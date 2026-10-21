import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import type { ConcreteTableId } from "metabase-types/api";

import { EventTablePicker } from "../EventTablePicker";

type TableSegmentsButtonProps = {
  tableId: ConcreteTableId | undefined;
  tableName: string | undefined;
  /** Absent when the table is fixed, as it is for a saved analysis. */
  onTableChange?: (tableId: ConcreteTableId) => void;
  isSegmentsOpen: boolean;
  onToggleSegments: () => void;
};

/**
 * The event table, joined to the button that shows and hides its segments.
 * Until a table is picked, the picker opens on its own.
 */
export const TableSegmentsButton = ({
  tableId,
  tableName,
  onTableChange,
  isSegmentsOpen,
  onToggleSegments,
}: TableSegmentsButtonProps) => {
  const segmentsLabel = isSegmentsOpen ? t`Hide segments` : t`Show segments`;

  return (
    <Button.Group>
      {onTableChange !== undefined ? (
        <EventTablePicker
          tableId={tableId}
          isInitiallyOpened={tableId === undefined}
          onChange={onTableChange}
        />
      ) : (
        <Button
          variant="default"
          fw="bold"
          leftSection={<Icon name="database" />}
          style={{ pointerEvents: "none" }}
        >
          {tableName ?? t`Loading…`}
        </Button>
      )}
      <Tooltip label={segmentsLabel}>
        <Button
          variant="default"
          px="sm"
          aria-label={segmentsLabel}
          aria-pressed={isSegmentsOpen}
          disabled={tableId === undefined}
          onClick={onToggleSegments}
        >
          <Icon name="segment" />
        </Button>
      </Tooltip>
    </Button.Group>
  );
};
