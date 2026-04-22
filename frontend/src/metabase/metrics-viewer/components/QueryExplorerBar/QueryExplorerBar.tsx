import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import { ActionIcon, Divider, Flex, Icon } from "metabase/ui";

import S from "./QueryExplorerBar.module.css";

export type QueryExplorerBarChartType = {
  /** The identifier for this chart type (e.g. "line", "bar", "area") */
  type: string;

  /** Icon to display for this chart type */
  icon: IconName;
};

export type QueryExplorerBarProps = {
  /** Available chart types to display as selectable buttons */
  chartTypes: QueryExplorerBarChartType[];

  /** Currently selected chart type */
  currentChartType: string;

  /** Called when a chart type button is clicked */
  onChartTypeChange: (type: string) => void;

  /** Optional slot for a layout/stack toggle control, rendered after chart types */
  layoutControl?: ReactNode;

  /** Optional slot for a filter control (e.g. date range picker) */
  filterControl?: ReactNode;

  /** Optional slot for a time granularity control (e.g. temporal bucket picker) */
  granularityControl?: ReactNode;
};

export function QueryExplorerBar({
  chartTypes,
  currentChartType,
  onChartTypeChange,
  layoutControl,
  filterControl,
  granularityControl,
}: QueryExplorerBarProps) {
  return (
    <Flex
      maw="100%"
      h="3rem"
      display="inline-flex"
      bg="background-primary"
      bd="1px solid var(--mb-color-border)"
      bdrs="lg"
      px="sm"
      align="center"
      gap="xs"
      data-testid="query-explorer-bar"
    >
      <Flex gap="xs" bg="background-secondary" p="xs" bdrs="md">
        {chartTypes.map(({ type, icon }) => (
          <ActionIcon
            w="2rem"
            key={type}
            variant={currentChartType === type ? "filled" : "subtle"}
            bg={currentChartType === type ? "background-primary" : undefined}
            onClick={() => onChartTypeChange(type)}
            aria-label={type}
            className={currentChartType === type ? S.selected : undefined}
          >
            <Icon
              name={icon}
              c={currentChartType === type ? "brand" : "text-primary"}
            />
          </ActionIcon>
        ))}
      </Flex>

      {layoutControl && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          {layoutControl}
        </>
      )}

      {filterControl && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          {filterControl}
        </>
      )}

      {granularityControl && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          {granularityControl}
        </>
      )}
    </Flex>
  );
}
