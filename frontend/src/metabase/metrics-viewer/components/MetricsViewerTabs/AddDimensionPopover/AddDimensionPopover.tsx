import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { DimensionPickerList } from "metabase/common/components/DimensionPickerList";
import { trackMetricsViewerDimensionTabAdded } from "metabase/metrics-viewer/analytics";
import type { TabInfo } from "metabase/metrics-viewer/utils/tabs";
import { ActionIcon, Box, Icon, Popover, Text, TextInput } from "metabase/ui";

import type { MetricSourceId } from "../../../types/viewer-state";
import type {
  AvailableDimensionsResult,
  DimensionPickerItem,
  DimensionPickerSection,
  SourceDisplayInfo,
} from "../../../utils/dimension-picker";
import { buildDimensionPickerSections } from "../../../utils/dimension-picker";
import { getScalarTabLabel } from "../../../utils/tabs";

import S from "./AddDimensionPopover.module.css";

type AddDimensionPopoverProps = {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  canAddScalarTab: boolean;
  onAddTab: (tabInfo: TabInfo) => void;
};

function filterSectionsBySearch(
  sections: DimensionPickerSection[],
  searchText: string,
): DimensionPickerSection[] {
  if (!searchText) {
    return sections;
  }
  const lower = searchText.toLowerCase();
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.name.toLowerCase().includes(lower),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function AddDimensionPopover({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
  canAddScalarTab,
}: AddDimensionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

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

  const filteredSections = useMemo(
    () => filterSectionsBySearch(finalSections, searchText),
    [finalSections, searchText],
  );

  const hasNoResults = filteredSections.length === 0 && searchText.length > 0;

  return (
    <Popover
      opened={isOpen}
      onChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchText("");
        }
      }}
      position="bottom-start"
    >
      <Popover.Target>
        <ActionIcon
          className={S.addButton}
          ml="xs"
          aria-label={t`Add dimension tab`}
          onClick={() => setIsOpen(true)}
        >
          <Icon name="add" c="icon-primary" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p={0} className={S.dropdown}>
        <Box className={S.searchSection} p="sm">
          <TextInput
            placeholder={t`Search for a dimension...`}
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
            leftSection={<Icon name="search" size={16} />}
            size="sm"
            radius="md"
          />
        </Box>
        <Box className={S.listSection}>
          {hasNoResults ? (
            <Box p="xl" w="17.5rem">
              <Text c="text-secondary" ta="center" size="sm">
                {t`No dimensions found`}
              </Text>
            </Box>
          ) : (
            <DimensionPickerList
              sections={filteredSections}
              onChange={handleSelect}
              renderItemIcon={renderItemIcon}
              renderItemName={(item) => item.name}
              w="17.5rem"
            />
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
