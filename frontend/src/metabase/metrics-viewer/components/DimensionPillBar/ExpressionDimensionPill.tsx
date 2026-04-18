import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import type { DimensionOption } from "metabase/common/components/DimensionPill";
import DPS from "metabase/common/components/DimensionPill/DimensionPill.module.css";
import { groupIntoSections } from "metabase/common/components/DimensionPill/utils";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import {
  Badge,
  Box,
  Flex,
  Icon,
  Popover,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

import type {
  ExpressionDimensionItem,
  ExpressionMetricSource,
} from "./DimensionPillBar";
import S from "./ExpressionDimensionPill.module.css";

const LIST_WIDTH = "20rem";

interface ExpressionDimensionPillProps {
  item: ExpressionDimensionItem;
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  disabled?: boolean;
}

function renderItemName(item: DimensionOption) {
  return item.displayName;
}

function renderItemIcon(item: DimensionOption) {
  return <Icon name={item.icon} />;
}

function itemIsSelected(item: DimensionOption) {
  return item.selected ?? false;
}

/**
 * A dimension pill for expression entities. Renders a single pill that, when
 * clicked, opens a popover with per-metric accordion sections so the user can
 * independently pick dimensions for each metric token in the expression.
 *
 * When the expression contains only one metric, the popover shows a flat
 * dimension list (same as a regular DimensionPill).
 */
export function ExpressionDimensionPill({
  item,
  onDimensionChange,
  disabled,
}: ExpressionDimensionPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSlots, setExpandedSlots] = useState<number[]>(() =>
    item.metricSources.length > 0 ? [item.metricSources[0].slotIndex] : [],
  );

  const hasOptions = item.metricSources.some(
    (s) => s.availableOptions.length > 0,
  );
  const isSingleMetric = item.metricSources.length === 1;
  const isPlaceholder = !item.label;
  const isEmpty = isPlaceholder && !hasOptions;
  const canOpenPopover = hasOptions && !disabled;

  const handleToggleExpanded = useCallback((slotIndex: number) => {
    setExpandedSlots((prev) =>
      prev.includes(slotIndex)
        ? prev.filter((s) => s !== slotIndex)
        : [...prev, slotIndex],
    );
  }, []);

  let pillLabel: string;
  if (isEmpty) {
    pillLabel = t`No compatible dimensions`;
  } else if (isPlaceholder) {
    pillLabel = t`Select dimensions`;
  } else {
    pillLabel = item.label ?? "";
  }

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="top-start"
      disabled={!canOpenPopover}
    >
      <Popover.Target>
        <Flex
          className={cx(DPS.pill, canOpenPopover && DPS.interactive)}
          align="center"
          gap="xs"
          opacity={disabled || isEmpty ? 0.6 : undefined}
          onClick={canOpenPopover ? () => setIsOpen(true) : undefined}
          data-testid="expression-dimension-pill"
        >
          <SourceColorIndicator colors={item.colors} fallbackIcon={item.icon} />
          <Text size="sm" lh={1} c={isEmpty ? "text-tertiary" : undefined}>
            {pillLabel}
          </Text>
        </Flex>
      </Popover.Target>
      <Popover.Dropdown
        px={0}
        py="xs"
        w={LIST_WIDTH}
        mah={300}
        className={S.dropdown}
      >
        {isSingleMetric ? (
          <SingleMetricContent
            source={item.metricSources[0]}
            onDimensionChange={onDimensionChange}
            onClose={() => setIsOpen(false)}
          />
        ) : (
          <MultiMetricContent
            sources={item.metricSources}
            expandedSlots={expandedSlots}
            onToggleExpanded={handleToggleExpanded}
            onDimensionChange={onDimensionChange}
            onClose={() => setIsOpen(false)}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

// ── Single metric: flat dimension list ──

interface SingleMetricContentProps {
  source: ExpressionMetricSource;
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  onClose: () => void;
}

function SingleMetricContent({
  source,
  onDimensionChange,
  onClose,
}: SingleMetricContentProps) {
  const sections = useMemo(
    () => groupIntoSections(source.availableOptions),
    [source.availableOptions],
  );

  const handleSelect = useCallback(
    (option: DimensionOption) => {
      onDimensionChange(source.slotIndex, option.dimension);
      onClose();
    },
    [onDimensionChange, source.slotIndex, onClose],
  );

  return (
    <AccordionList
      className={S.dimensionList}
      sections={sections}
      onChange={handleSelect}
      renderItemName={renderItemName}
      renderItemIcon={renderItemIcon}
      itemIsSelected={itemIsSelected}
      alwaysExpanded
      maxHeight={Infinity}
      width={240}
    />
  );
}

// ── Multiple metrics: accordion sections ──

interface MultiMetricContentProps {
  sources: ExpressionMetricSource[];
  expandedSlots: number[];
  onToggleExpanded: (slotIndex: number) => void;
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  onClose: () => void;
}

function MultiMetricContent({
  sources,
  expandedSlots,
  onToggleExpanded,
  onDimensionChange,
  onClose,
}: MultiMetricContentProps) {
  return (
    <Box>
      {sources.map((source) => {
        const isExpanded = expandedSlots.includes(source.slotIndex);
        const hasDimensions = source.availableOptions.length > 0;
        const showDimensions = isExpanded && hasDimensions;

        return (
          <MetricAccordionItem
            key={source.slotIndex}
            source={source}
            isExpanded={isExpanded}
            showDimensions={showDimensions}
            onToggle={() => onToggleExpanded(source.slotIndex)}
            onDimensionChange={onDimensionChange}
            onClose={onClose}
          />
        );
      })}
    </Box>
  );
}

interface MetricAccordionItemProps {
  source: ExpressionMetricSource;
  isExpanded: boolean;
  showDimensions: boolean;
  onToggle: () => void;
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  onClose: () => void;
}

function MetricAccordionItem({
  source,
  isExpanded,
  showDimensions,
  onToggle,
  onDimensionChange,
  onClose,
}: MetricAccordionItemProps) {
  const sections: Section<DimensionOption>[] = useMemo(
    () => groupIntoSections(source.availableOptions),
    [source.availableOptions],
  );

  const handleSelect = useCallback(
    (option: DimensionOption) => {
      onDimensionChange(source.slotIndex, option.dimension);
      onClose();
    },
    [onDimensionChange, source.slotIndex, onClose],
  );

  return (
    <Box className={S.accordionItem} data-testid="expression-metric-section">
      <UnstyledButton
        className={cx(S.accordionControl, {
          [S.accordionControlExpanded]: showDimensions,
        })}
        onClick={onToggle}
        w="100%"
        data-testid="expression-metric-header"
      >
        <Flex align="center" gap="sm" px="md">
          <SourceColorIndicator colors={source.colors} size={16} />
          <Flex align="center" gap="xs" fw={700} style={{ flex: 1 }}>
            <span>{source.metricName}</span>
            {(source.metricCount ?? 0) > 1 && (
              <Badge circle c="text-hover">
                {source.metricCount}
              </Badge>
            )}
          </Flex>
          <Icon name={isExpanded ? "chevronup" : "chevrondown"} size={12} />
        </Flex>
      </UnstyledButton>
      {showDimensions && (
        <Box pb="sm">
          <AccordionList
            className={S.dimensionList}
            sections={sections}
            onChange={handleSelect}
            renderItemName={renderItemName}
            renderItemIcon={renderItemIcon}
            itemIsSelected={itemIsSelected}
            alwaysExpanded
            maxHeight={Infinity}
            width="100%"
          />
        </Box>
      )}
    </Box>
  );
}
