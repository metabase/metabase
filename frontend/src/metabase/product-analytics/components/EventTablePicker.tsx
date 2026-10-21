import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import {
  DataPickerModal,
  MiniPicker,
} from "metabase/common/components/Pickers";
import { Button, Icon } from "metabase/ui";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId, TableId } from "metabase-types/api";

type EventTablePickerProps = {
  tableId: ConcreteTableId | undefined;
  isLoading: boolean;
  /** Fills its container, as at the top of an analysis's side panel. */
  fullWidth?: boolean;
  onChange: (tableId: ConcreteTableId) => void;
};

export const EventTablePicker = ({
  tableId,
  isLoading,
  fullWidth = false,
  onChange,
}: EventTablePickerProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const table = useGetTableQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );

  const handleChange = (id: TableId) => {
    if (isConcreteTableId(id)) {
      onChange(id);
    }
    setIsOpened(false);
    setIsBrowsing(false);
  };

  const label = table.data?.display_name ?? t`Pick a table`;
  const pickerValue =
    tableId !== undefined && table.data !== undefined
      ? {
          id: tableId,
          model: "table" as const,
          database_id: table.data.db_id,
        }
      : undefined;

  return (
    <>
      <MiniPicker
        value={pickerValue}
        opened={isOpened && !isBrowsing}
        onClose={() => setIsOpened(false)}
        // MiniPicker's own Menu onChange only closes, so a click on the target
        // would immediately undo the open. Let the target toggle it instead.
        menuProps={{ onChange: setIsOpened }}
        models={["table"]}
        onBrowseAll={() => setIsBrowsing(true)}
        onChange={(item) => {
          if (item.model === "table") {
            handleChange(item.id);
          }
        }}
      >
        <Button
          variant="default"
          size={fullWidth ? "md" : "lg"}
          fw="bold"
          fullWidth={fullWidth}
          justify={fullWidth ? "flex-start" : undefined}
          loading={isLoading || table.isLoading}
          leftSection={<Icon name="database" />}
        >
          {label}
        </Button>
      </MiniPicker>
      {isOpened && isBrowsing && (
        <DataPickerModal
          title={t`Pick a table`}
          value={pickerValue}
          models={["table"]}
          onChange={handleChange}
          onClose={() => {
            setIsBrowsing(false);
            setIsOpened(false);
          }}
        />
      )}
    </>
  );
};
