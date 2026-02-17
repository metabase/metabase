import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { HoverParent } from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import type { IconName } from "metabase/ui";
import { Flex, Icon } from "metabase/ui";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { getDimensionIcon, getDimensionsByType } from "../../utils/tabs";

import S from "./BreakoutDimensionPicker.module.css";
import { MetricBucketPicker } from "./MetricBucketPicker";

const NONE_ITEM_NAME = "__none__" as const;

type DimensionItem =
  | {
      name: typeof NONE_ITEM_NAME;
      displayName: string;
      dimension: null;
      icon: IconName;
      selected?: boolean;
    }
  | {
      name: string;
      displayName: string;
      dimension: DimensionMetadata;
      icon: IconName;
      selected?: boolean;
    };

interface BreakoutDimensionPickerProps {
  definition: MetricDefinition;
  currentBreakoutDimension: ProjectionClause | undefined;
  currentBreakoutDimensionName: string | null;
  onSelect: (dimension: ProjectionClause | undefined) => void;
  onClose: () => void;
}

export function BreakoutDimensionPicker({
  definition,
  currentBreakoutDimension,
  currentBreakoutDimensionName,
  onSelect,
  onClose,
}: BreakoutDimensionPickerProps) {
  const dimensions = useMemo(
    () => getDimensionsByType(definition),
    [definition],
  );

  const sections: Section<DimensionItem>[] = useMemo(() => {
    const dims = [...dimensions.values()];
    const groups = new Map<
      string | undefined,
      { groupName: string; items: DimensionItem[] }
    >();

    for (const dim of dims) {
      const groupId = dim.group?.id;
      const entry = groups.get(groupId);
      const item: DimensionItem = {
        name: dim.name,
        displayName: dim.displayName,
        dimension: dim.dimension,
        icon: getDimensionIcon(dim.dimension),
        selected: currentBreakoutDimensionName === dim.name,
      };

      if (entry) {
        entry.items.push(item);
      } else {
        groups.set(groupId, {
          groupName: dim.group?.displayName ?? "",
          items: [item],
        });
      }
    }

    const noneItem: DimensionItem = {
      name: NONE_ITEM_NAME,
      displayName: t`None`,
      dimension: null,
      icon: "close",
      selected: currentBreakoutDimensionName === null,
    };

    const noneSection: Section<DimensionItem> = {
      items: [noneItem],
    };

    if (groups.size <= 1) {
      const items = groups.size === 1 ? [...groups.values()][0].items : [];
      return [noneSection, { items }];
    }

    return [
      noneSection,
      ...[...groups.values()].map(({ groupName, items }) => ({
        name: groupName || undefined,
        items,
      })),
    ];
  }, [dimensions, currentBreakoutDimensionName]);

  const handleSelect = useCallback(
    (dimension: ProjectionClause) => {
      onSelect(dimension);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleChange = useCallback(
    (item: DimensionItem) => {
      if (item.name === NONE_ITEM_NAME) {
        onSelect(undefined);
        onClose();
        return;
      }

      handleSelect(LibMetric.dimensionReference(item.dimension));
    },
    [handleSelect, onSelect, onClose],
  );

  const renderItemName = useCallback(
    (item: DimensionItem) => item.displayName,
    [],
  );

  const renderItemIcon = useCallback(
    (item: DimensionItem) => <Icon name={item.icon} />,
    [],
  );

  const itemIsSelected = useCallback(
    (item: DimensionItem) => item.selected ?? false,
    [],
  );

  const renderItemExtra = useCallback(
    (item: DimensionItem, isSelected: boolean) => {
      if (item.name === NONE_ITEM_NAME) {
        return null;
      }

      const isBinnable = LibMetric.isBinnable(definition, item.dimension);
      const isTemporalBucketable = LibMetric.isTemporalBucketable(
        definition,
        item.dimension,
      );

      if (!isBinnable && !isTemporalBucketable) {
        return null;
      }

      return (
        <MetricBucketPicker
          definition={definition}
          dimension={item.dimension}
          activeDimension={isSelected ? currentBreakoutDimension : undefined}
          isEditing={isSelected}
          onSelect={handleSelect}
        />
      );
    },
    [definition, currentBreakoutDimension, handleSelect],
  );

  const renderItemWrapper = useCallback(
    (content: ReactNode) => (
      <HoverParent className={S.itemWrapper}>{content}</HoverParent>
    ),
    [],
  );

  return (
    <Flex direction="column" mah={400} py="xs" className={S.pickerContainer}>
      <AccordionList
        className={S.dimensionList}
        sections={sections}
        onChange={handleChange}
        renderItemName={renderItemName}
        renderItemIcon={renderItemIcon}
        renderItemExtra={renderItemExtra}
        renderItemWrapper={renderItemWrapper}
        itemIsSelected={itemIsSelected}
        alwaysExpanded
        maxHeight={Infinity}
        width={260}
      />
    </Flex>
  );
}
