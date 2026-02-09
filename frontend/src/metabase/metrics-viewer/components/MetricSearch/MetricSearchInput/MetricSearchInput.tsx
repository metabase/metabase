import { useClickOutside } from "@mantine/hooks";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Paper, TextInput } from "metabase/ui";

import type { SelectedMetric } from "../../../types/viewer-state";
import { MetricPill } from "../MetricPill";

import S from "./MetricSearchInput.module.css";

type MetricSearchInputProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: Record<number, string>;
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number) => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
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

  const handleInputClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  return (
    <Box ref={containerRef} pos="relative">
      <Flex
        className={S.inputWrapper}
        align="center"
        gap="sm"
        bg="background-secondary"
        px="sm"
        py="xs"
        onClick={handleContainerClick}
      >
        <Flex align="center" gap="sm" flex={1} wrap="wrap" mih={36}>
          {selectedMetrics.map((metric) => (
            <MetricPill
              key={metric.id}
              metric={metric}
              color={metricColors[metric.id]}
              selectedMetricIds={selectedMetricIds}
              selectedMeasureIds={selectedMeasureIds}
              onSwap={onSwapMetric}
              onRemove={onRemoveMetric}
              onOpen={handleClose}
            />
          ))}
          <Box pos="relative" flex={1} miw={120} ml="xs">
            <TextInput
              ref={inputRef}
              classNames={{ input: S.inputField }}
              w="100%"
              variant="unstyled"
              placeholder={
                selectedMetrics.length === 0 ? t`Search for metrics...` : ""
              }
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setIsOpen(true);
              }}
              onClick={handleInputClick}
              onKeyDown={handleKeyDown}
            />
            {isOpen && (
              <Paper
                className={S.dropdown}
                pos="absolute"
                top="calc(100% + 4px)"
                left={0}
                shadow="md"
                withBorder
                mah={400}
                maw={400}
                miw={300}
              >
                {children({
                  searchText,
                  isOpen,
                  onSelect: handleSelect,
                })}
              </Paper>
            )}
          </Box>
        </Flex>
        {rightSection && <Box flex="0 0 auto">{rightSection}</Box>}
      </Flex>
    </Box>
  );
}
