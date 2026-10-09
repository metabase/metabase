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
  onChange: (tableId: ConcreteTableId) => void;
};

export const EventTablePicker = ({
  tableId,
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
          leftSection={<Icon name="table2" />}
          onClick={() => setIsOpened(true)}
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
