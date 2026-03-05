import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { IconName } from "metabase/ui";
import { Divider, Flex, Icon, Popover, Text } from "metabase/ui";
import type { DimensionGroup, DimensionMetadata } from "metabase-lib/metric";

import S from "./DimensionPill.module.css";
import { groupIntoSections } from "./utils";

export interface DimensionOption {
  name: string;
  displayName: string;
  icon: IconName;
  dimension: DimensionMetadata;
  group?: DimensionGroup;
  selected?: boolean;
}

export interface DimensionPillProps {
  label?: string;
  icon?: IconName;
  colors?: string[];
  options: DimensionOption[];
  onSelect: (dimension: DimensionMetadata) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

interface RemoveAction {
  name: string;
  displayName: string;
  icon: IconName;
}

const REMOVE_ACTION: RemoveAction = {
  name: "__remove__",
  get displayName() {
    return t`Remove dimension`;
  },
  icon: "close",
};

const REMOVE_SECTIONS: Section<RemoveAction>[] = [{ items: [REMOVE_ACTION] }];

function renderItemName(item: DimensionOption | RemoveAction) {
  return item.displayName;
}

function renderItemIcon(item: DimensionOption | RemoveAction) {
  return <Icon name={item.icon} />;
}

function dimensionItemIsSelected(item: DimensionOption) {
  return item.selected ?? false;
}

function removeItemIsSelected() {
  return false;
}

export function DimensionPill({
  label,
  icon,
  colors,
  options,
  onSelect,
  onRemove,
  disabled,
}: DimensionPillProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isPlaceholder = !label;
  const isEmpty = isPlaceholder && options.length === 0;
  const hasMultipleOptions =
    options.length > 1 || (isPlaceholder && options.length > 0);
  const canRemove = !isPlaceholder && onRemove != null;
  const canOpenPopover = hasMultipleOptions || canRemove;

  const handleSelect = useCallback(
    (item: DimensionOption) => {
      onSelect(item.dimension);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleRemove = useCallback(() => {
    onRemove?.();
    setIsOpen(false);
  }, [onRemove]);

  let pillLabel: string;
  if (isEmpty) {
    pillLabel = t`No compatible dimensions`;
  } else if (isPlaceholder) {
    pillLabel = t`Select a dimension`;
  } else {
    pillLabel = label;
  }

  const sections: Section<DimensionOption>[] = useMemo(
    () => groupIntoSections(options),
    [options],
  );

  const pillContent = (
    <Flex
      className={S.pill}
      align="center"
      gap="xs"
      onClick={canOpenPopover && !disabled ? () => setIsOpen(true) : undefined}
      data-disabled={disabled || isEmpty}
      data-static={!canOpenPopover}
      data-placeholder={isPlaceholder || undefined}
    >
      <SourceColorIndicator colors={colors} fallbackIcon={icon ?? "add"} />
      <Text size="sm" lh={1} c={isEmpty ? "text-tertiary" : undefined}>
        {pillLabel}
      </Text>
    </Flex>
  );

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="top-start"
      disabled={!canOpenPopover}
    >
      <Popover.Target>{pillContent}</Popover.Target>
      <Popover.Dropdown px={0} py="xs" mah={300} className={S.dropdown}>
        {hasMultipleOptions && (
          <AccordionList
            className={S.dimensionList}
            sections={sections}
            onChange={handleSelect}
            renderItemName={renderItemName}
            renderItemIcon={renderItemIcon}
            itemIsSelected={dimensionItemIsSelected}
            alwaysExpanded
            maxHeight={Infinity}
            width={240}
          />
        )}
        {canRemove && (
          <>
            {hasMultipleOptions && <Divider my="xs" />}
            <AccordionList
              className={S.dimensionList}
              sections={REMOVE_SECTIONS}
              onChange={handleRemove}
              renderItemName={renderItemName}
              renderItemIcon={renderItemIcon}
              itemIsSelected={removeItemIsSelected}
              alwaysExpanded
              maxHeight={Infinity}
              width={240}
            />
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
