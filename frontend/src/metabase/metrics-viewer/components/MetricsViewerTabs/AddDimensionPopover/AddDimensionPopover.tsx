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

    const splitByGroup = (dims: AvailableDimension[], sectionName?: string) => {
      const groups = new Map<string | undefined, AvailableDimension[]>();
      for (const dim of dims) {
        const groupId = dim.group?.id;
        const arr = groups.get(groupId);
        if (arr) {
          arr.push(dim);
        } else {
          groups.set(groupId, [dim]);
        }
      }

      if (groups.size <= 1) {
        result.push({
          name: sectionName,
          items: dims.map((dim) => ({ ...dim, name: dim.label })),
        });
        return;
      }

      for (const [, groupDims] of groups) {
        const groupName = groupDims[0].group?.displayName;
        const name = sectionName ? `${sectionName} · ${groupName}` : groupName;
        result.push({
          name,
          items: groupDims.map((dim) => ({ ...dim, name: dim.label })),
        });
      }
    };

    if (hasMultipleSources && availableDimensions.shared.length > 0) {
      splitByGroup(availableDimensions.shared, t`Shared`);
    }

    for (const sourceId of sourceOrder) {
      const sourceDimensions = availableDimensions.bySource[sourceId];
      if (!sourceDimensions || sourceDimensions.length === 0) {
        continue;
      }

      if (hasMultipleSources) {
        const sourceName = getSourceDisplayName(sourceId, sourceDataById);
        splitByGroup(sourceDimensions, sourceName);
      } else {
        splitByGroup(sourceDimensions);
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
