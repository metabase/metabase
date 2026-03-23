import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { AccordionList } from "metabase/common/components/AccordionList";
import type { MetricSourceId } from "metabase/metrics-viewer/types/viewer-state";
import type {
  AvailableDimensionsResult,
  DimensionPickerItem,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils/dimension-picker";
import { buildDimensionPickerSections } from "metabase/metrics-viewer/utils/dimension-picker";
import { Box, Icon, Popover } from "metabase/ui";

import S from "./AddDimensionPopover.module.css";

type AddDimensionPopoverProps = {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  onAddTab: (dimensionId: string) => void;
  children: ReactElement;
};

export function AddDimensionPopover({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
  children,
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

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        <Box onClick={() => setIsOpen(true)}>{children}</Box>
      </Popover.Target>
      <Popover.Dropdown p={0} className={S.dropdown}>
        <AccordionList
          className={S.dimensionPicker}
          sections={sections}
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
