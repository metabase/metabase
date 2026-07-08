import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types";
import type { DimensionPickerItem } from "metabase/metrics-viewer/utils";
import { Badge, Box, Flex, Icon, Text, UnstyledButton } from "metabase/ui";

import { AllFieldsSectionList } from "./AllFieldsSectionList";
import S from "./MetricAccordionItem.module.css";
import type { AllFieldsMetricGroup } from "./types";

export function MetricAccordionItem({
  activeDimensionBreakout,
  group,
  isExpanded,
  onToggle,
  onSelect,
}: {
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
  group: AllFieldsMetricGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (item: DimensionPickerItem) => void;
}) {
  const showOccurrenceCount =
    group.occurrenceCount != null && group.occurrenceCount > 1;

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
            fallbackIcon={group.isExpressionToken ? undefined : "metric"}
            size={16}
          />
          <Text className={S.metricAccordionLabel} component="span">
            {group.name}
          </Text>
          {showOccurrenceCount && (
            <Badge
              className={S.occurrenceCountBadge}
              circle
              c="text-brand-hover"
            >
              {group.occurrenceCount}
            </Badge>
          )}
        </Flex>
        <Icon name={isExpanded ? "chevronup" : "chevrondown"} size={12} />
      </UnstyledButton>
      {isExpanded && (
        <Box className={S.metricAccordionPanel}>
          <AllFieldsSectionList
            activeDimensionBreakout={activeDimensionBreakout}
            sections={group.sections}
            onSelect={onSelect}
          />
        </Box>
      )}
    </Box>
  );
}
