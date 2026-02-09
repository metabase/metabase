import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { ActionIcon, Icon, Popover } from "metabase/ui";

import type { MetricSourceId } from "../../../types/viewer-state";

import type {
  AvailableDimension,
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "../../../utils/tabs";
import { getSourceDisplayName } from "../../../utils/tabs";

import S from "./AddDimensionPopover.module.css";

type AddDimensionPopoverProps = {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  onAddTab: (dimensionName: string) => void;
};

type DimensionItem = AvailableDimension & {
  name: string;
};

export function AddDimensionPopover({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
}: AddDimensionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sections: Section<DimensionItem>[] = useMemo(() => {
    const result: Section<DimensionItem>[] = [];

    if (hasMultipleSources && availableDimensions.shared.length > 0) {
      result.push({
        name: t`Shared`,
        items: availableDimensions.shared.map((dim) => ({
          ...dim,
          name: dim.label,
        })),
      });
    }

    for (const sourceId of sourceOrder) {
      const sourceDimensions = availableDimensions.bySource[sourceId];
      if (!sourceDimensions || sourceDimensions.length === 0) {
        continue;
      }

      if (hasMultipleSources) {
        const sourceName = getSourceDisplayName(sourceId, sourceDataById);
        result.push({
          name: sourceName,
          items: sourceDimensions.map((dim) => ({
            ...dim,
            name: dim.label,
          })),
        });
      } else {
        result.push({
          items: sourceDimensions.map((dim) => ({
            ...dim,
            name: dim.label,
          })),
        });
      }
    }

    return result;
  }, [availableDimensions, sourceOrder, sourceDataById, hasMultipleSources]);

  const handleSelect = useCallback(
    (item: DimensionItem) => {
      onAddTab(item.dimensionName);
      setIsOpen(false);
    },
    [onAddTab],
  );

  const renderItemIcon = useCallback(
    (item: DimensionItem) => <Icon name={item.icon} />,
    [],
  );

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        <ActionIcon
          className={S.addButton}
          aria-label={t`Add dimension tab`}
          onClick={() => setIsOpen(true)}
        >
          <Icon name="add" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <AccordionList
          className={S.dimensionPicker}
          sections={sections}
          onChange={handleSelect}
          renderItemIcon={renderItemIcon}
          alwaysExpanded
          globalSearch
          searchable
          maxHeight={300}
          width={280}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
