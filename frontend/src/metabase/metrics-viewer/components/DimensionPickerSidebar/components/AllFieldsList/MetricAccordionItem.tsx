import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { MetricsViewerTabState } from "metabase/metrics-viewer/types";
import type { DimensionPickerItem } from "metabase/metrics-viewer/utils";
import { Box, Flex, Icon, Text, UnstyledButton } from "metabase/ui";

import { AllFieldsSectionList } from "./AllFieldsSectionList";
import S from "./MetricAccordionItem.module.css";
import type { AllFieldsMetricGroup } from "./types";

export function MetricAccordionItem({
  activeTab,
  group,
  isExpanded,
  onToggle,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
  group: AllFieldsMetricGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (item: DimensionPickerItem) => void;
}) {
  return (
    <Box className={S.metricAccordionItem}>
      <UnstyledButton
        className={S.metricAccordionControl}
        aria-label={group.name}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <Flex align="center" gap="sm" miw={0}>
          <SourceColorIndicator
            colors={group.colors}
            fallbackIcon="metric"
            size={16}
          />
          <Text className={S.metricAccordionLabel} component="span">
            {group.name}
          </Text>
        </Flex>
        <Icon name={isExpanded ? "chevronup" : "chevrondown"} size={12} />
      </UnstyledButton>
      {isExpanded && (
        <Box className={S.metricAccordionPanel}>
          <AllFieldsSectionList
            activeTab={activeTab}
            sections={group.sections}
            onSelect={onSelect}
          />
        </Box>
      )}
    </Box>
  );
}
