import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import { trackMetricsViewerDimensionTabAdded } from "metabase/metrics-viewer/analytics";
import type { MetricSourceId } from "metabase/metrics-viewer/types";
import {
  type AvailableDimensionsResult,
  type DimensionPickerItem,
  type DimensionPickerSection,
  type SourceDisplayInfo,
  type TabInfo,
  buildDimensionPickerSections,
  getScalarTabLabel,
} from "metabase/metrics-viewer/utils";
import { ActionIcon, Icon, Popover } from "metabase/ui";

import S from "./AddDimensionPopover.module.css";

type RenderTriggerArgs = {
  toggle: () => void;
  isOpen: boolean;
};

type AddDimensionPopoverProps = {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  canAddScalarTab: boolean;
  onAddTab: (tabInfo: TabInfo) => void;
  renderTrigger?: (args: RenderTriggerArgs) => ReactElement;
};

export function AddDimensionPopover({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
  canAddScalarTab,
  renderTrigger,
}: AddDimensionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((open) => !open), []);

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
      onAddTab(item.tabInfo);
      trackMetricsViewerDimensionTabAdded();
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
            icon: "number",
            tabInfo: {
              type: "scalar",
              label: getScalarTabLabel(),
              dimensionMapping: {},
            },
          },
        ],
      },
      ...sections,
    ];
  }

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        {renderTrigger ? (
          renderTrigger({ toggle, isOpen })
        ) : (
          <ActionIcon
            className={S.addButton}
            ml="xs"
            aria-label={t`Add dimension tab`}
            onClick={toggle}
          >
            <Icon name="add" c="icon-primary" />
          </ActionIcon>
        )}
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
