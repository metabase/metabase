import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
} from "metabase/metrics-viewer/utils";
import { Stack, Text } from "metabase/ui";

import { getSidebarSectionName, hasMatchingDimensions } from "../../utils";

import { DimensionButton } from "./DimensionButton";

export function AllFieldsSectionList({
  activeDimensionBreakout,
  sections,
  onSelect,
}: {
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
  sections: DimensionPickerSection[];
  onSelect: (item: DimensionPickerItem) => void;
}) {
  return (
    <Stack gap="lg">
      {sections.map((section, sectionIndex) => {
        const sectionKey = section.name
          ? `${section.name}-${sectionIndex}`
          : `section-${sectionIndex}`;
        const sectionName = getSidebarSectionName(section.name);

        return (
          <Stack key={sectionKey} gap="xs">
            {sectionName && (
              <Text px="sm" size="sm" c="text-secondary">
                {sectionName}
              </Text>
            )}
            <Stack gap={0}>
              {section.items.map((item, itemIndex) => (
                <DimensionButton
                  key={`${item.dimensionBreakoutInfo.type}-${item.name}-${itemIndex}`}
                  item={item}
                  isSelected={hasMatchingDimensions(
                    item,
                    activeDimensionBreakout,
                  )}
                  onClick={() => onSelect(item)}
                />
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
