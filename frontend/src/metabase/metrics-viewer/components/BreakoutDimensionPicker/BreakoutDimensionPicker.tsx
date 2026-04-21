import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import { DimensionPickerList } from "metabase/common/components/DimensionPickerList";
import {
  type DimensionOption,
  type ListSection,
  groupIntoSections,
} from "metabase/common/components/DimensionPill";
import { HoverParent } from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { Flex, Icon } from "metabase/ui";
import type { MetricDefinition, ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { getDimensionsByType } from "../../utils/tabs";

import S from "./BreakoutDimensionPicker.module.css";
import { DimensionBinningPicker } from "./DimensionBinningPicker";
import { DimensionTemporalUnitPicker } from "./DimensionTemporalUnitPicker";

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

  const sections: ListSection<DimensionOption>[] = useMemo(() => {
    const items: DimensionOption[] = [...dimensions.values()].map((dim) => ({
      ...dim,
      dimension: dim.dimensionMetadata,
      selected: currentBreakoutDimensionName === dim.name,
    }));

    return groupIntoSections(items);
  }, [dimensions, currentBreakoutDimensionName]);

  const handleSelect = useCallback(
    (dimension: ProjectionClause) => {
      onSelect(dimension);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleChange = useCallback(
    (item: DimensionOption) => {
      handleSelect(LibMetric.dimensionReference(item.dimension));
    },
    [handleSelect],
  );

  const renderItemName = useCallback(
    (item: DimensionOption) => item.displayName,
    [],
  );

  const renderItemIcon = useCallback(
    (item: DimensionOption) => <Icon name={item.icon} />,
    [],
  );

  const itemIsSelected = useCallback(
    (item: DimensionOption) => item.selected ?? false,
    [],
  );

  const renderItemExtra = useCallback(
    (item: DimensionOption, isSelected: boolean) => {
      const isBinnable = LibMetric.isBinnable(definition, item.dimension);
      const isTemporalBucketable = LibMetric.isTemporalBucketable(
        definition,
        item.dimension,
      );

      if (isTemporalBucketable) {
        return (
          <DimensionTemporalUnitPicker
            definition={definition}
            dimension={item.dimension}
            activeDimension={isSelected ? currentBreakoutDimension : undefined}
            isEditing={isSelected}
            onSelect={handleSelect}
          />
        );
      }

      if (isBinnable) {
        return (
          <DimensionBinningPicker
            definition={definition}
            dimension={item.dimension}
            activeDimension={isSelected ? currentBreakoutDimension : undefined}
            isEditing={isSelected}
            onSelect={handleSelect}
          />
        );
      }

      return null;
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
    <Flex direction="column" mah="25rem" py="xs" className={S.pickerContainer}>
      <DimensionPickerList
        sections={sections}
        onChange={handleChange}
        renderItemName={renderItemName}
        renderItemIcon={renderItemIcon}
        renderItemExtra={renderItemExtra}
        renderItemWrapper={renderItemWrapper}
        itemIsSelected={itemIsSelected}
        w="16rem"
      />
    </Flex>
  );
}
