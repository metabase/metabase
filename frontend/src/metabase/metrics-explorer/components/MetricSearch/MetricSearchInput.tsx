import { useClickOutside } from "@mantine/hooks";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Paper, TextInput } from "metabase/ui";
import type { BaseRecentItem, ConcreteTableId, RecentItem } from "metabase-types/api";

type MetricSourceType = "metric" | "measure";

import S from "./MetricSearchInput.module.css";
import { MetricSwapPopover } from "./MetricSwapPopover";

export type SelectedMetric = Pick<BaseRecentItem, "id" | "name"> & {
  sourceType: MetricSourceType;
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};


type MetricSearchInputProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: Record<number, string>;
  recents: RecentItem[];
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number) => void;
  onSwapMetric: (oldMetricId: number, newMetric: SelectedMetric) => void;
  rightSection?: ReactNode;
  children: (props: {
    searchText: string;
    isOpen: boolean;
    onSelect: (metric: SelectedMetric) => void;
  }) => ReactNode;
};

export function MetricSearchInput({
  selectedMetrics,
  metricColors,
  recents,
  selectedMetricIds,
  selectedMeasureIds,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  rightSection,
  children,
}: MetricSearchInputProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const containerRef = useClickOutside(handleClose);

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
      if (event.key === "Escape") {
        handleClose();
      }
      if (
        event.key === "Backspace" &&
        searchText === "" &&
        selectedMetrics.length > 0
      ) {
        onRemoveMetric(selectedMetrics[selectedMetrics.length - 1].id);
      }
    },
    [handleClose, searchText, selectedMetrics, onRemoveMetric],
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Box ref={containerRef} className={S.container}>
      <Flex
        className={S.inputWrapper}
        align="center"
        gap="sm"
        onClick={handleContainerClick}
      >
        <Flex align="center" gap="0.5rem" flex={1} wrap="wrap" mih={36}>
          {selectedMetrics.map((metric) => (
            <MetricSwapPopover
              key={metric.id}
              metric={metric}
              color={metricColors[metric.id]}
              recents={recents}
              selectedMetricIds={selectedMetricIds}
              selectedMeasureIds={selectedMeasureIds}
              onSwap={onSwapMetric}
              onRemove={onRemoveMetric}
              onOpen={handleClose}
            />
          ))}
          <Box className={S.inputContainer}>
            <TextInput
              ref={inputRef}
              classNames={{
                root: S.inputRoot,
                wrapper: S.inputFieldWrapper,
                input: S.inputField,
              }}
              variant="unstyled"
              placeholder={
                selectedMetrics.length === 0 ? t`Search for metrics...` : ""
              }
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
            />
            {isOpen &&
              (() => {
                const content = children({
                  searchText,
                  isOpen,
                  onSelect: handleSelect,
                });
                return content ? (
                  <Paper className={S.dropdown} shadow="md" withBorder>
                    {content}
                  </Paper>
                ) : null;
              })()}
          </Box>
        </Flex>
        {rightSection && <Box className={S.rightSection}>{rightSection}</Box>}
      </Flex>
    </Box>
  );
}
