import { useMemo } from "react";
import { Button, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import { Icon } from "metabase/core/components/Icon";
import { getAvailableItems, getSelectedItem } from "./utils";

interface TimeseriesBucketPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

export function TimeseriesBucketPicker({
  query,
  stageIndex,
  column,
  onChange,
}: TimeseriesBucketPickerProps) {
  const selectedItem = useMemo(
    () => getSelectedItem(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const availableItems = useMemo(
    () => getAvailableItems(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const handleChange = (bucket: Lib.Bucket | null) => {
    onChange(Lib.withTemporalBucket(column, bucket));
  };

  return (
    <Menu>
      <Menu.Target>
        <Button
          rightIcon={<Icon name="chevrondown" />}
          data-testid="timeseries-bucket-button"
        >
          {selectedItem.name}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {availableItems.map((option, index) => (
          <Menu.Item key={index} onClick={() => handleChange(option.bucket)}>
            {option.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
