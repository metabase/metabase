import type { MetricsViewerTabState } from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
} from "metabase/metrics-viewer/utils";
import { Stack, Text } from "metabase/ui";

import { getSidebarSectionName, hasSameDimensions } from "../../utils";

import { DimensionButton } from "./DimensionButton";

export function AllFieldsSectionList({
  activeTab,
  sections,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
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
                  key={`${item.tabInfo.type}-${item.name}-${itemIndex}`}
                  item={item}
                  isSelected={hasSameDimensions(item, activeTab)}
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
