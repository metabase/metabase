import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Flex, Popover, TextInput } from "metabase/ui";
import type { ProjectionClause } from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SelectedMetric,
  SourceColorMap,
} from "../../../types/viewer-state";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../../../utils/source-ids";
import { MetricPill } from "../MetricPill";
import { MetricSearchDropdown } from "../MetricSearchDropdown";

import S from "./MetricSearchInput.module.css";

type MetricSearchInputProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  definitions: MetricsViewerDefinitionEntry[];
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;
};

export function MetricSearchInput({
  selectedMetrics,
  metricColors,
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
}: MetricSearchInputProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedMetricIds = useMemo(
    () =>
      new Set(
        selectedMetrics
          .filter((metric) => metric.sourceType === "metric")
          .map((metric) => metric.id),
      ),
    [selectedMetrics],
  );

  const selectedMeasureIds = useMemo(
    () =>
      new Set(
        selectedMetrics
          .filter((metric) => metric.sourceType === "measure")
          .map((metric) => metric.id),
      ),
    [selectedMetrics],
  );

  const definitionsBySourceId = useMemo(
    () => new Map(definitions.map((entry) => [entry.id, entry] as const)),
    [definitions],
  );

  const handleSelect = useCallback(
    (metric: SelectedMetric) => {
      onAddMetric(metric);
      setSearchText("");
      setIsOpen(false);
    },
    [onAddMetric],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (
        event.key === "Backspace" &&
        searchText === "" &&
        selectedMetrics.length > 0
      ) {
        const last = selectedMetrics[selectedMetrics.length - 1];
        onRemoveMetric(last.id, last.sourceType);
      }
    },
    [searchText, selectedMetrics, onRemoveMetric],
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleInputClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  return (
    <Flex
      className={S.inputWrapper}
      bg="background-secondary"
      align="center"
      gap="sm"
      px="sm"
      py="xs"
      onClick={handleContainerClick}
    >
      <Flex align="center" gap="sm" flex={1} wrap="wrap" mih={36}>
        {selectedMetrics.map((metric) => {
          const sid =
            metric.sourceType === "metric"
              ? createMetricSourceId(metric.id)
              : createMeasureSourceId(metric.id);
          const entry = definitionsBySourceId.get(sid);
          if (!entry) {
            return null;
          }
          return (
            <MetricPill
              key={`${metric.sourceType}-${metric.id}`}
              metric={metric}
              colors={metricColors[sid]}
              definitionEntry={entry}
              selectedMetricIds={selectedMetricIds}
              selectedMeasureIds={selectedMeasureIds}
              onSwap={onSwapMetric}
              onRemove={onRemoveMetric}
              onSetBreakout={(dimension) => onSetBreakout(sid, dimension)}
              onOpen={() => setIsOpen(false)}
            />
          );
        })}
        <Popover
          opened={isOpen}
          onChange={setIsOpen}
          position="bottom-start"
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <TextInput
              ref={inputRef}
              classNames={{ input: S.inputField }}
              flex={1}
              miw={120}
              ml="xs"
              variant="unstyled"
              placeholder={
                selectedMetrics.length === 0 ? t`Search for metrics...` : ""
              }
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setIsOpen(true);
              }}
              onClick={handleInputClick}
              onKeyDown={handleKeyDown}
              data-testid="metrics-viewer-search-input"
            />
          </Popover.Target>
          <Popover.Dropdown p={0} miw={300} maw={400}>
            {isOpen && (
              <MetricSearchDropdown
                selectedMetricIds={selectedMetricIds}
                selectedMeasureIds={selectedMeasureIds}
                onSelect={handleSelect}
                externalSearchText={searchText}
              />
            )}
          </Popover.Dropdown>
        </Popover>
      </Flex>
    </Flex>
  );
}
