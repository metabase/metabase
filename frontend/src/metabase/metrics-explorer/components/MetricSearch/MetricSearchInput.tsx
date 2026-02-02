import { useClickOutside } from "@mantine/hooks";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { dataStudioMetric, dataStudioPublishedTableMeasure } from "metabase/lib/urls/data-studio";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Flex, Icon, Loader, Paper, Pill, TextInput } from "metabase/ui";
import type { BaseRecentItem, ConcreteTableId } from "metabase-types/api";

type MetricSourceType = "metric" | "measure";

import S from "./MetricSearchInput.module.css";

export type SelectedMetric = Pick<BaseRecentItem, "id" | "name"> & {
  sourceType: MetricSourceType;
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};


type MetricSearchInputProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: Record<number, string>;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number) => void;
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
  onAddMetric,
  onRemoveMetric,
  rightSection,
  children,
}: MetricSearchInputProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canAccessDataStudio = useSelector(PLUGIN_DATA_STUDIO.canAccessDataStudio);

  const getMetricUrl = useCallback(
    (metric: SelectedMetric): string | null => {
      if (metric.sourceType === "measure") {
        // Measures only exist in data studio
        // tableId is undefined while data is loading
        if (!canAccessDataStudio || !metric.tableId) {
          return null;
        }
        return dataStudioPublishedTableMeasure(metric.tableId, metric.id);
      }
      // Metrics
      if (canAccessDataStudio) {
        return dataStudioMetric(metric.id);
      }
      return Urls.metric({ id: metric.id, name: metric.name, type: "metric" });
    },
    [canAccessDataStudio],
  );

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
            <Pill
              key={metric.id}
              className={S.metricPill}
              withRemoveButton
              onRemove={() => onRemoveMetric(metric.id)}
              removeButtonProps={{
                mr: 0,
                "aria-label": metric.isLoading
                  ? t`Remove metric`
                  : t`Remove ${metric.name}`,
              }}
            >
              <Flex align="center" gap="xs">
                {metric.isLoading ? (
                  <Loader size="xs" />
                ) : (
                  (() => {
                    const url = getMetricUrl(metric);
                    const content = (
                      <>
                        <Icon
                          name={metric.sourceType === "measure" ? "sum" : "metric"}
                          size={14}
                          c={metricColors[metric.id] as Parameters<typeof Icon>[0]["c"]}
                        />
                        <span>{metric.name}</span>
                      </>
                    );
                    return url ? (
                      <a
                        href={url}
                        className={S.pillLink}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {content}
                      </a>
                    ) : (
                      content
                    );
                  })()
                )}
              </Flex>
            </Pill>
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
