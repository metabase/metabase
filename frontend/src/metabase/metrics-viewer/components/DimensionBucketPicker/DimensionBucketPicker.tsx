import { useCallback, useState } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { SelectList } from "metabase/common/components/SelectList";
import { Button, Icon, Popover } from "metabase/ui";

import S from "./DimensionBucketPicker.module.css";

export type BucketItem = {
  displayName: string;
  isDefault?: boolean;
  isSelected?: boolean;
};

interface DimensionBucketPickerProps {
  triggerLabel: string;
  items: BucketItem[];
  onSelect: (index: number) => void;
}

export function DimensionBucketPicker({
  triggerLabel,
  items,
  onSelect,
}: DimensionBucketPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(index);
      setIsOpen(false);
    },
    [onSelect],
  );

  return (
    <Popover
      opened={isOpen}
      position="right"
      onClose={handleClose}
      withinPortal={false}
      onChange={(v) => !v && handleClose()}
      floatingStrategy="fixed"
    >
      <Popover.Target>
        <Button
          className={S.triggerButton}
          data-bucket-trigger
          data-testid="dimension-list-item-binning"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(!isOpen);
          }}
          px="sm"
          miw="35%"
          maw="50%"
          h="auto"
          py={0}
          variant="subtle"
          color="white"
          classNames={{ label: S.triggerButtonLabel }}
        >
          <Ellipsified>{triggerLabel}</Ellipsified>
          <Icon name="chevronright" className={S.chevronIcon} />
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList p="sm" miw="10rem">
          {items.map((item, index) => (
            <SelectList.Item
              key={item.displayName}
              id={item.displayName}
              name={item.displayName}
              isSelected={item.isSelected}
              onSelect={(_, e) => handleSelect(index, e)}
            />
          ))}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  );
}
