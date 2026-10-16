import cx from "classnames";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useGetAdhocQueryMetadataQuery } from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
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
import type Question from "metabase-lib/v1/Question";
import type { Card, IconName, RawSeries } from "metabase-types/api";

import { SummarySidebar, getChartSummarySession } from "../SummarySidebar";

import S from "./TableFlow.module.css";
import { XrayFilterPills } from "./XrayFilterPills";
import { XrayFilterSidebar } from "./XrayFilterSidebar";
import { useCardSeries } from "./XrayGallery";
import type { XrayChart } from "./utils";

type XrayChartDetailProps = {
  chart: XrayChart;
  /** The chart's card including any filter/summarize edits. */
  card: Card;
  /** CSS height of the data table card and the side panel. */
  tableHeight: string;
  onCardChange: (card: Card) => void;
  onClose: () => void;
};

type SidePanel = "filter" | "summarize";

/**
 * An x-ray chart at full width above its data. Filter and Summarize open a floating side
 * panel that edits the chart's card.
 */
export function XrayChartDetail({
  chart,
  card,
  tableHeight,
  onCardChange,
  onClose,
}: XrayChartDetailProps) {
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  // loads the columns of every table the chart touches, so filters and summaries can offer them
  const { isFetching: isMetadataFetching } = useGetAdhocQueryMetadataQuery(
    chart.card.dataset_query,
  );
  const question = useQuestionFromCard(card);
  const { rawSeries, error } = useCardSeries(card);
  const tableSeries: RawSeries | null =
    rawSeries?.map(({ card, data }) => ({
      card: {
        ...card,
        display: "table",
        visualization_settings: { "table.pivot": false },
      },
      data,
    })) ?? null;

  const handleQuestionChange = (nextQuestion: Question) =>
    onCardChange(nextQuestion.card());
  const togglePanel = (panel: SidePanel) =>
    setSidePanel(sidePanel === panel ? null : panel);

  return (
    <div className={S.detailLayout}>
      <div className={S.detailMain}>
        <div className={cx(S.card, S.detailChartCard)}>
          {/* the page header titles the chart, so the card only needs a way back */}
          <Flex justify="flex-end">
            <Tooltip label={t`Back to table`}>
              <ActionIcon
                variant="viewHeader"
                aria-label={t`Back to table`}
                onClick={onClose}
              >
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          </Flex>
          <Box className={S.chartArea}>
            <SeriesVisualization rawSeries={rawSeries} error={error} />
          </Box>
        </div>
        <div
          className={cx(S.card, S.tableCard)}
          style={{ height: tableHeight }}
        >
          <Flex className={S.tableHeader} gap="sm" align="flex-start">
            <Box flex={1} miw={0}>
              <XrayFilterPills
                query={question.query()}
                onChange={(query) =>
                  handleQuestionChange(question.setQuery(query))
                }
              />
            </Box>
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
          <div className={S.tableArea}>
            <SeriesVisualization rawSeries={tableSeries} error={error} />
          </div>
        </div>
      </div>
      {sidePanel != null && (
        <aside
          className={cx(S.card, S.sidePanel)}
          style={{ height: tableHeight }}
        >
          {isMetadataFetching ? (
            <Flex h="100%" align="center" justify="center">
              <Loader />
            </Flex>
          ) : (
            match(sidePanel)
              .with("filter", () => (
                <XrayFilterSidebar
                  question={question}
                  onQuestionChange={handleQuestionChange}
                  onClose={() => setSidePanel(null)}
                />
              ))
              .with("summarize", () => (
                <SummarySidebar
                  question={question}
                  createSession={getChartSummarySession}
                  onQuestionChange={handleQuestionChange}
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

function SeriesVisualization({
  rawSeries,
  error,
}: {
  rawSeries: RawSeries | null;
  error: string | null;
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
    />
  );
}
