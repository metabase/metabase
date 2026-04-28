import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useState } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { QueryExplorerBar } from "metabase/metrics-viewer/components/QueryExplorerBar";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { Box, Button, DefaultSelectItem, Flex, Popover } from "metabase/ui";

import { McpExploreButton } from "./McpExploreButton";
import { useChartTypes } from "./hooks/useChartTypes";
import { useDateFilter } from "./hooks/useDateFilter";
import { useTemporalGranularity } from "./hooks/useTemporalGranularity";

interface McpQueryBarProps {
  app: App | null;
  instanceUrl: string;
}

export function McpQueryBar({ app, instanceUrl }: McpQueryBarProps) {
  const { question, updateQuestion, queryResults } = useSdkQuestionContext();
  const [isBucketOpen, setIsBucketOpen] = useState(false);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);

  const {
    sensibleChartTypes,
    hasOnlyTable,
    selectedChartType,
    handleDisplayChange,
  } = useChartTypes(question, queryResults, updateQuestion);

  const {
    temporalColumn,
    rawTemporalColumn,
    currentUnit,
    availableItems,
    bucketLabel,
    handleBucketChange,
  } = useTemporalGranularity(question, updateQuestion);

  const {
    dateFilterClause,
    dateFilterValue,
    dateFilterLabel,
    datePickerUnits,
    handleDateFilterChange,
    handleDateFilterClear,
  } = useDateFilter(question, updateQuestion, rawTemporalColumn);

  if (
    !question ||
    !queryResults ||
    sensibleChartTypes.length === 0 ||
    hasOnlyTable
  ) {
    return null;
  }

  const filterControl = rawTemporalColumn ? (
    <Popover opened={isDateFilterOpen} onChange={setIsDateFilterOpen}>
      <Popover.Target>
        <Button
          fw="bold"
          px="md"
          variant="subtle"
          color="text-primary"
          styles={{
            root: {
              "&:hover": {
                backgroundColor: "var(--mb-color-background-hover)",
              },
            },
          }}
          onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
        >
          {dateFilterLabel}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <DatePicker
          value={dateFilterValue}
          availableUnits={datePickerUnits}
          onChange={(value) => {
            handleDateFilterChange(value);
            setIsDateFilterOpen(false);
          }}
          renderSubmitButton={({ value }) => (
            <Flex justify="space-between" w="100%">
              {dateFilterClause ? (
                <Button
                  variant="subtle"
                  c="text-secondary"
                  onClick={() => {
                    handleDateFilterClear();
                    setIsDateFilterOpen(false);
                  }}
                >
                  {t`All time`}
                </Button>
              ) : (
                <div />
              )}
              <Button
                type="submit"
                variant="filled"
                disabled={!value}
              >{t`Apply`}</Button>
            </Flex>
          )}
        />
      </Popover.Dropdown>
    </Popover>
  ) : undefined;

  const granularityControl =
    temporalColumn && availableItems.length > 0 ? (
      <Popover opened={isBucketOpen} onChange={setIsBucketOpen}>
        <Popover.Target>
          <Button
            fw="bold"
            py="xs"
            px="md"
            variant="subtle"
            color="text-primary"
            styles={{
              root: {
                "&:hover": {
                  backgroundColor: "var(--mb-color-background-hover)",
                },
              },
            }}
            onClick={() => setIsBucketOpen(!isBucketOpen)}
          >
            {bucketLabel}
          </Button>
        </Popover.Target>

        <Popover.Dropdown>
          <Box p="sm" miw={180}>
            <DefaultSelectItem
              value="none"
              label={t`All time`}
              selected={!currentUnit}
              onClick={() => {
                handleBucketChange(null);
                setIsBucketOpen(false);
              }}
              role="option"
            />
            {availableItems.map(({ bucket, unit, label }) => (
              <DefaultSelectItem
                key={unit}
                value={unit}
                label={label}
                selected={currentUnit === unit}
                onClick={() => {
                  handleBucketChange(bucket);
                  setIsBucketOpen(false);
                }}
                role="option"
              />
            ))}
          </Box>
        </Popover.Dropdown>
      </Popover>
    ) : undefined;

  return (
    <QueryExplorerBar
      chartTypes={sensibleChartTypes}
      currentChartType={selectedChartType ?? ""}
      onChartTypeChange={handleDisplayChange}
      filterControl={filterControl}
      granularityControl={granularityControl}
      exploreControl={<McpExploreButton app={app} instanceUrl={instanceUrl} />}
    />
  );
}
