import { useElementSize } from "@mantine/hooks";
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
import type {
  Dataset,
  IconName,
  RawSeries,
  SeriesCard,
} from "metabase-types/api";
import type Question from "metabase-lib/v1/Question";

import { SummarySidebar, getChartSummarySession } from "../SummarySidebar";

import { ChartMetricBar } from "./ChartMetricBar";
import S from "./TableFlow.module.css";
import { XrayFilterPills } from "./XrayFilterPills";
import { XrayFilterSidebar } from "./XrayFilterSidebar";
import { ResizableChartPanel, ResizableSidePanel } from "./ResizablePanels";
import { TableSearch } from "./TableSearch";
import {
  VisualizationPicker,
  VisualizationSettingsPanel,
} from "./VisualizationControls";
import { applyTableDrill } from "./utils";

type ChartDetailProps = {
  question: Question;
  /** The question's chart, shown full width above its data; `null` for questions shown as a table. */
  chart: ReactNode | null;
  /** The question's results; drive the suggested visualizations and their settings. */
  result: Dataset | null;
  /** The data table's contents. */
  table: ReactNode;
  /** Searches the table's rows; omit to hide the search. */
  search?: { text: string; onChange: (text: string) => void };
  /** `false` while the columns and metrics the editors offer are still loading. */
  isMetadataReady: boolean;
  onQuestionChange: (question: Question) => void;
};

type SidePanel = "filter" | "summarize";

/** The vertical gap between the chart and table cards, `--mantine-spacing-md` in `.detailMain`. */
const PANEL_GAP = 12;

/**
 * A question's data table, under its chart when it has one. The metric bar, the Summarize
 * and Filter panels, the filter pills, and table drills all produce a new question
 * through `onQuestionChange`, so the chart, its data, and the editors always agree.
 */
export function ChartDetail({
  question,
  chart,
  result,
  table,
  search,
  isMetadataReady,
  onQuestionChange,
}: ChartDetailProps) {
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [isMetricBarOpen, setIsMetricBarOpen] = useState(false);
  const [isVizSettingsOpen, setIsVizSettingsOpen] = useState(false);
  const hasFilters = useMemo(
    () => getFilterItems(question.query()).length > 0,
    [question],
  );
  const { ref: layoutRef, width: layoutWidth } = useElementSize();
  const { ref: mainRef, height: mainHeight } = useElementSize();
  const { ref: tableHeaderRef, height: tableHeaderHeight } = useElementSize();
  // the chart may grow until the table below shows only its header
  const maxChartHeight =
    mainHeight > 0 ? mainHeight - tableHeaderHeight - PANEL_GAP : Infinity;
  const maxSidePanelWidth = layoutWidth > 0 ? layoutWidth / 2 : Infinity;

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
    <div ref={layoutRef} className={S.detailLayout}>
      {chart != null && isVizSettingsOpen && (
        <ResizableSidePanel
          side="left"
          maxWidth={maxSidePanelWidth}
          className={cx(S.card, S.sidePanel)}
          onCollapse={() => setIsVizSettingsOpen(false)}
        >
          <VisualizationSettingsPanel
            question={question}
            result={result}
            onQuestionChange={onQuestionChange}
            onClose={() => setIsVizSettingsOpen(false)}
          />
        </ResizableSidePanel>
      )}
      <div ref={mainRef} className={S.detailMain}>
        {chart != null && (
          <ResizableChartPanel
            maxHeight={maxChartHeight}
            className={cx(S.card, S.detailChartCard)}
            renderCollapsed={(expand) => (
              <Button
                variant="subtle"
                size="sm"
                leftSection={<Icon name="chevrondown" />}
                onClick={expand}
              >
                {t`Show chart`}
              </Button>
            )}
          >
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
            <VisualizationPicker
              question={question}
              result={result}
              onQuestionChange={onQuestionChange}
              onOpenSettings={() => setIsVizSettingsOpen(true)}
            />
          </ResizableChartPanel>
        )}
        <div className={cx(S.card, S.tableCard)}>
          <Flex
            ref={tableHeaderRef}
            className={S.tableHeader}
            gap="sm"
            align="center"
          >
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
        <ResizableSidePanel
          side="right"
          maxWidth={maxSidePanelWidth}
          className={cx(S.card, S.sidePanel)}
          onCollapse={() => setSidePanel(null)}
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
        </ResizableSidePanel>
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
