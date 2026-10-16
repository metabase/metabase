import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { defaultClickActionMode } from "metabase/querying/click-actions/lib/modes";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Skeleton,
  Text,
  Tooltip,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { IconName, RawSeries, SeriesCard } from "metabase-types/api";
import type Question from "metabase-lib/v1/Question";

import { SummarySidebar, getChartSummarySession } from "../SummarySidebar";

import { ChartMetricBar } from "./ChartMetricBar";
import S from "./TableFlow.module.css";
import { XrayFilterPills } from "./XrayFilterPills";
import { XrayFilterSidebar } from "./XrayFilterSidebar";
import { TableSearch } from "./TableSearch";
import { applyTableDrill } from "./utils";

type ChartDetailProps = {
  question: Question;
  /** The question's chart, shown full width above its data; `null` for questions shown as a table. */
  chart: ReactNode | null;
  /** The data table's contents. */
  table: ReactNode;
  /** Searches the table's rows; omit to hide the search. */
  search?: { text: string; onChange: (text: string) => void };
  /** CSS height of the data table card and the side panel. */
  tableHeight: string;
  /** `false` while the columns and metrics the editors offer are still loading. */
  isMetadataReady: boolean;
  onQuestionChange: (question: Question) => void;
};

type SidePanel = "filter" | "summarize";

/**
 * A question's data table, under its chart when it has one. The metric bar, the Summarize
 * and Filter panels, the filter pills, and table drills all produce a new question
 * through `onQuestionChange`, so the chart, its data, and the editors always agree.
 */
export function ChartDetail({
  question,
  chart,
  table,
  search,
  tableHeight,
  isMetadataReady,
  onQuestionChange,
}: ChartDetailProps) {
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [isMetricBarOpen, setIsMetricBarOpen] = useState(false);
  const hasFilters = useMemo(
    () => getFilterItems(question.query()).length > 0,
    [question],
  );

  const togglePanel = (panel: SidePanel) =>
    setSidePanel(sidePanel === panel ? null : panel);

  useRegisterShortcut(
    [
      {
        id: "query-builder-visualization-open-filter",
        perform: () => togglePanel("filter"),
      },
      {
        id: "query-builder-toggle-summarize-sidebar",
        perform: () => togglePanel("summarize"),
      },
    ],
    [sidePanel],
  );

  return (
    <div className={S.detailLayout}>
      <div className={S.detailMain}>
        {chart != null && (
          <div className={cx(S.card, S.detailChartCard)}>
            <Flex align="flex-start" gap="sm">
              <Box flex={1} miw={0}>
                {isMetricBarOpen && isMetadataReady && (
                  <ChartMetricBar
                    question={question}
                    onQuestionChange={onQuestionChange}
                    onOpenSummary={() => setSidePanel("summarize")}
                  />
                )}
              </Box>
              <Tooltip label={t`Add a metric`}>
                <ActionIcon
                  variant="viewHeader"
                  aria-label={t`Add a metric`}
                  aria-pressed={isMetricBarOpen}
                  onClick={() => setIsMetricBarOpen(!isMetricBarOpen)}
                >
                  <Icon name="add" />
                </ActionIcon>
              </Tooltip>
            </Flex>
            <Box className={S.chartArea}>{chart}</Box>
          </div>
        )}
        <div
          className={cx(S.card, S.tableCard)}
          style={{ height: tableHeight }}
        >
          <Flex className={S.tableHeader} gap="sm" align="center">
            {search && (
              <TableSearch
                searchText={search.text}
                onSearchTextChange={search.onChange}
                isCollapsed={hasFilters}
              />
            )}
            {hasFilters && (
              <Box className={S.filterPills}>
                <XrayFilterPills
                  query={question.query()}
                  onChange={(query) =>
                    onQuestionChange(question.setQuery(query))
                  }
                />
              </Box>
            )}
            <Flex className={S.tableActions} gap="sm">
              <PanelToggleButton
                label={t`Filter`}
                icon="filter"
                colorVar="--mb-color-core-filter"
                isActive={sidePanel === "filter"}
                onClick={() => togglePanel("filter")}
              />
              <PanelToggleButton
                label={t`Summarize`}
                icon="sum"
                colorVar="--mb-color-core-summarize"
                isActive={sidePanel === "summarize"}
                onClick={() => togglePanel("summarize")}
              />
            </Flex>
          </Flex>
          <div className={S.tableArea}>{table}</div>
        </div>
      </div>
      {sidePanel != null && (
        <aside
          className={cx(S.card, S.sidePanel)}
          style={{ height: tableHeight }}
        >
          {!isMetadataReady ? (
            <Flex h="100%" align="center" justify="center">
              <Loader />
            </Flex>
          ) : (
            match(sidePanel)
              .with("filter", () => (
                <XrayFilterSidebar
                  question={question}
                  onQuestionChange={onQuestionChange}
                  onClose={() => setSidePanel(null)}
                />
              ))
              .with("summarize", () => (
                <SummarySidebar
                  question={question}
                  createSession={getChartSummarySession}
                  onQuestionChange={onQuestionChange}
                  onClose={() => setSidePanel(null)}
                />
              ))
              .exhaustive()
          )}
        </aside>
      )}
    </div>
  );
}

type PanelToggleButtonProps = {
  label: string;
  icon: IconName;
  /** CSS variable of the button's color while its panel is open. */
  colorVar: string;
  isActive: boolean;
  onClick: () => void;
};

function PanelToggleButton({
  label,
  icon,
  colorVar,
  isActive,
  onClick,
}: PanelToggleButtonProps) {
  return (
    <Button
      size="sm"
      variant={isActive ? "filled" : "default"}
      vars={() => ({
        root: isActive
          ? {
              "--button-bg": `var(${colorVar})`,
              "--button-hover": `color-mix(in srgb, var(${colorVar}) 88%, transparent)`,
              "--button-pressed": `var(${colorVar})`,
            }
          : {},
      })}
      leftSection={<Icon name={icon} />}
      aria-pressed={isActive}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function SeriesVisualization({
  rawSeries,
  error,
  onDrill,
}: {
  rawSeries: RawSeries | null;
  error: string | null;
  onDrill: (nextCard: SeriesCard) => void;
}) {
  if (error) {
    return (
      <Text p="md" c="text-secondary">
        {error}
      </Text>
    );
  }
  if (!rawSeries) {
    return <Skeleton h="100%" />;
  }
  return (
    <Visualization
      // "dataset" mode hides the object detail expander column, which can't open rows of an ad-hoc x-ray query
      queryBuilderMode="dataset"
      rawSeries={rawSeries}
      isQueryBuilder={false}
      showTitle={false}
      mode={defaultClickActionMode}
      onChangeCardAndRun={({ nextCard }) => onDrill(nextCard)}
    />
  );
}

/** Each column of a one-row result as its own number, side by side. */
export function ValuesRow({ rawSeries }: { rawSeries: RawSeries | null }) {
  const [series] = rawSeries ?? [];
  if (series == null) {
    return <Skeleton h="100%" />;
  }
  const { card, data } = series;
  return (
    <Flex className={S.valuesRow} data-testid="chart-values-row">
      {data.cols.map((col, index) => (
        <Box key={col.name} className={S.valuesRowItem}>
          <Visualization
            rawSeries={[
              {
                card: {
                  ...card,
                  name: col.display_name,
                  display: "scalar",
                  visualization_settings: {},
                },
                data: {
                  ...data,
                  cols: [col],
                  rows: data.rows.map((row) => [row[index]]),
                },
              },
            ]}
            isQueryBuilder={false}
            showTitle
          />
        </Box>
      ))}
    </Flex>
  );
}

type ResultTableProps = {
  question: Question;
  /** The question's results, shown as a plain table whatever the question's display. */
  rawSeries: RawSeries | null;
  error: string | null;
  onQuestionChange: (question: Question) => void;
};

/** A chart's results as a table; drills stay in the view by changing the question. */
export function ResultTable({
  question,
  rawSeries,
  error,
  onQuestionChange,
}: ResultTableProps) {
  const tableSeries: RawSeries | null =
    rawSeries?.map(({ card, data }) => ({
      card: {
        ...card,
        display: "table",
        visualization_settings: { "table.pivot": false },
      },
      data,
    })) ?? null;

  return (
    <SeriesVisualization
      rawSeries={tableSeries}
      error={error}
      onDrill={(nextCard) =>
        onQuestionChange(applyTableDrill(question, nextCard))
      }
    />
  );
}
