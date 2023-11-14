import { useMemo } from "react";
import { t } from "ttag";
import { Button, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import { Icon } from "metabase/core/components/Icon";
import { getAvailableOptions, getSelectedItem } from "./utils";

interface TemporalBucketSelectProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

export function TemporalBucketSelect({
  query,
  stageIndex,
  column,
  onChange,
}: TemporalBucketSelectProps) {
  const selectedItem = useMemo(
    () => getSelectedItem(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const availableItems = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const handleChange = (bucket: Lib.Bucket) => {
    onChange(Lib.withTemporalBucket(column, bucket));
  };

  return (
    <Menu>
      <Menu.Target>
        <Button rightIcon={<Icon name="chevrondown" />}>
          {selectedItem ? selectedItem.displayName : t`Unbinned`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {availableItems.map(option => (
          <Menu.Item
            key={option.shortName}
            onClick={() => handleChange(option.bucket)}
          >
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
