import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import { ActionIcon, Icon, Popover } from "metabase/ui";

import type { MetricSourceId } from "../../../types/viewer-state";
import type {
  AvailableDimensionsResult,
  DimensionPickerItem,
  DimensionPickerSection,
  SourceDisplayInfo,
} from "../../../utils/dimension-picker";
import { buildDimensionPickerSections } from "../../../utils/dimension-picker";
import {
  SCALAR_TAB_DIMENSION_ID,
  getScalarTabLabel,
} from "../../../utils/tabs";

import S from "./AddDimensionPopover.module.css";

type AddDimensionPopoverProps = {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  onAddTab: (dimensionId: string) => void;
  canAddScalarTab: boolean;
};

export function AddDimensionPopover({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
  canAddScalarTab,
}: AddDimensionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sections = useMemo(
    () =>
      buildDimensionPickerSections({
        availableDimensions,
        sourceOrder,
        sourceDataById,
        hasMultipleSources,
      }),
    [availableDimensions, sourceOrder, sourceDataById, hasMultipleSources],
  );

  const handleSelect = useCallback(
    (item: DimensionPickerItem) => {
      onAddTab(item.dimensionId);
      setIsOpen(false);
    },
    [onAddTab],
  );

  const renderItemIcon = useCallback(
    (item: DimensionPickerItem) => <Icon name={item.icon} />,
    [],
  );

  let finalSections: DimensionPickerSection[] = sections;
  if (canAddScalarTab) {
    finalSections = [
      {
        items: [
          {
            name: getScalarTabLabel(),
            label: getScalarTabLabel(),
            tabType: "scalar",
            icon: "number",
            dimensionId: SCALAR_TAB_DIMENSION_ID,
            sourceIds: [],
          },
        ],
      },
      ...sections,
    ];
  }

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        <ActionIcon
          className={S.addButton}
          ml="xs"
          aria-label={t`Add dimension tab`}
          onClick={() => setIsOpen(true)}
        >
          <Icon name="add" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p={0} className={S.dropdown}>
        <AccordionList
          className={S.dimensionPicker}
          sections={finalSections}
          onChange={handleSelect}
          renderItemIcon={renderItemIcon}
          alwaysExpanded
          globalSearch
          searchable
          maxHeight={300}
          width="17.5rem"
        />
      </Popover.Dropdown>
    </Popover>
  );
}
