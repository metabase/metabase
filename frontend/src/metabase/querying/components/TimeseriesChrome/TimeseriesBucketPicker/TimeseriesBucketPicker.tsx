import { useMemo, useState, useCallback } from "react";
import { t } from "ttag";

import { Button, Menu, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { BucketItem } from "./types";
import { getAvailableItems, getSelectedItem } from "./utils";

interface TimeseriesBucketPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

const INITIALLY_VISIBLE_ITEMS_COUNT = 7;

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

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(
    isInitiallyExpanded(availableItems, selectedItem),
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsExpanded(false);
  }, [setIsOpen]);

  const handleChange = (bucket: Lib.Bucket | null) => {
    onChange(Lib.withTemporalBucket(column, bucket));
    setIsOpen(false);
    setIsExpanded(false);
  };

  const handleExpand = useCallback((evt: React.MouseEvent) => {
    evt.stopPropagation();
    evt.preventDefault();
    setIsExpanded(true);
  }, []);

  const canExpand = availableItems.length > INITIALLY_VISIBLE_ITEMS_COUNT;
  const hasMoreButton = canExpand && !isExpanded;
  const visibleItems = hasMoreButton
    ? availableItems.slice(0, INITIALLY_VISIBLE_ITEMS_COUNT)
    : availableItems;

  return (
    <Menu
      closeOnItemClick={false}
      opened={isOpen}
      onOpen={handleOpen}
      onClose={handleClose}
    >
      <Menu.Target>
        <Button
          rightIcon={<Icon name="chevrondown" />}
          data-testid="timeseries-bucket-button"
        >
          {selectedItem.name}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {visibleItems.map((option, index) => (
          <Menu.Item key={index} onClick={() => handleChange(option.bucket)}>
            {option.name}
          </Menu.Item>
        ))}

        {hasMoreButton && (
          <Menu.Item onClick={handleExpand}>
            <Text color="brand">{t`More…`}</Text>
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

function isInitiallyExpanded(items: BucketItem[], selectedItem: BucketItem) {
  const canExpand = items.length > INITIALLY_VISIBLE_ITEMS_COUNT;
  if (!canExpand || !selectedItem) {
    return false;
  }

  const selectedIndex = items.findIndex(
    item => item.name === selectedItem.name,
  );

  return selectedIndex >= INITIALLY_VISIBLE_ITEMS_COUNT;
}
