import { t } from "ttag";

import type { MetricsViewerTabState } from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
} from "metabase/metrics-viewer/utils";
import { Stack, Text } from "metabase/ui";

import { getSidebarSectionName, hasSameDimensions } from "../utils";

import { DimensionButton } from "./DimensionButton";

export function AllFieldsList({
  activeTab,
  sections,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
  sections: DimensionPickerSection[];
  onSelect: (item: DimensionPickerItem) => void;
}) {
  if (sections.length === 0) {
    return (
      <Text c="text-secondary" ta="center" py="lg">{t`No fields found`}</Text>
    );
  }

  return (
    <Stack gap="lg">
      {sections.map((section, sectionIndex) => {
        const sectionKey = section.name ?? `section-${sectionIndex}`;
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
