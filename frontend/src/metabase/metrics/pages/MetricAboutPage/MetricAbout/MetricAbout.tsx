import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetMetricQuery } from "metabase/api";
import {
  DetailPageLayout,
  DetailPanel,
} from "metabase/common/components/DetailPanel";
import { Link } from "metabase/common/components/Link";
import { MetricCardVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import type { MetricUrls } from "metabase/common/metrics/types";
import { getDatasetValueForMetric } from "metabase/common/metrics/utils/dataset-value";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/current-user";
import { useQuestionFromCard } from "metabase/metadata-store";
import { MetricActivityTimeline } from "metabase/metrics/components/MetricActivityTimeline";
import { MetricDimensionGrid } from "metabase/metrics/components/MetricDimensionGrid";
import { MetricDimensions } from "metabase/metrics/components/MetricDimensions";
import { MetricQueryEditor } from "metabase/metrics/components/MetricQueryEditor";
import { getMetricDeltas } from "metabase/metrics/utils/deltas";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { useSelector } from "metabase/redux";
import { Box, Button, Card, Group, Stack, Text } from "metabase/ui";
import type {
  Card as CardApiType,
  CardQueryMetadata,
} from "metabase-types/api";

import { DescriptionSection } from "./DescriptionSection";
import { ExploreMetricButton } from "./ExploreMetricButton";
import S from "./MetricAbout.module.css";
import { MetricDimensionPills } from "./MetricDimensionPills";
import { useMetricAboutQuery } from "./use-metric-about-query";

interface MetricAboutProps {
  card: CardApiType;
  metadata: CardQueryMetadata;
  urls: MetricUrls;
}

const GRAPH_PANEL_HEIGHT = 360;

export function MetricAbout({ card, metadata, urls }: MetricAboutProps) {
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(
    null,
  );
  const {
    activeDimensionId,
    activeDimensionSelectLabel,
    data,
    dimensionOptions,
    isLoading,
    isTimeSeries,
    visualizationCard,
  } = useMetricAboutQuery(card, selectedDimensionId);

  // The active dimension's label carries its temporal unit or binning suffix, which only the
  // resolved dataset knows about.
  const pillOptions = useMemo(
    () =>
      dimensionOptions.map((option) =>
        option.value === activeDimensionId && activeDimensionSelectLabel
          ? { ...option, label: activeDimensionSelectLabel }
          : option,
      ),
    [dimensionOptions, activeDimensionId, activeDimensionSelectLabel],
  );

  const { data: metric } = useGetMetricQuery(card.id);
  const hasBreakdowns = Boolean(metric?.dimensions?.length);

  const canSeeDependencies =
    useSelector((state) => getUserIsAdmin(state) || getUserIsAnalyst(state)) &&
    PLUGIN_DEPENDENCIES.isEnabled;

  const headline = data ? getDatasetValueForMetric(data) : null;
  const deltas = data && isTimeSeries ? getMetricDeltas(data) : null;

  return (
    <DetailPageLayout rail={<DescriptionSection card={card} urls={urls} />}>
      <Card withBorder shadow="none" p={0}>
        <Stack gap={0} p="lg" pb={0}>
          {headline && (
            <Group align="baseline" gap="sm" data-testid="metric-value-preview">
              <Text fz="2.5rem" fw={600} lh={1}>
                {headline.value}
              </Text>
              <Text size="sm" c="text-secondary">
                {headline.label}
              </Text>
            </Group>
          )}
          {deltas && (
            <Group gap="lg" mt="sm">
              <DeltaText change={deltas.previous} label={t`vs prior period`} />
              <DeltaText change={deltas.yearAgo} label={t`year over year`} />
            </Group>
          )}
        </Stack>
        <Box className={S.chartContainer} mt="md">
          {isNumericMetric(card) && (
            <Box className={S.exploreButtonOverlay}>
              <ExploreMetricButton cardId={card.id} />
            </Box>
          )}
          <MetricCardVisualization
            card={visualizationCard}
            data={data}
            isLoading={isLoading}
            className={S.visualizationPanel}
          />
        </Box>
        {dimensionOptions.length > 0 && (
          <MetricDimensionPills
            options={pillOptions}
            value={activeDimensionId}
            onChange={setSelectedDimensionId}
          />
        )}
      </Card>

      <DetailPanel
        flush
        title={t`Definition`}
        actions={
          card.can_write && (
            <Button
              component={Link}
              to={urls.query(card.id)}
              variant="subtle"
              size="compact-sm"
            >
              {t`Edit`}
            </Button>
          )
        }
      >
        <MetricDefinitionPreview card={card} />
      </DetailPanel>

      {hasBreakdowns && (
        <DetailPanel title={t`Breakdowns`}>
          <MetricDimensionGrid
            metricId={card.id}
            dimensions={metric?.dimensions ?? []}
          />
        </DetailPanel>
      )}

      <DetailPanel title={t`Dimensions`}>
        <MetricDimensions metricId={card.id} queryMetadata={metadata} />
      </DetailPanel>

      {canSeeDependencies && (
        <DetailPanel
          flush
          title={t`Used by`}
          actions={
            <Button
              component={Link}
              to={urls.dependencies(card.id)}
              variant="subtle"
              size="compact-sm"
            >
              {t`Open full graph`}
            </Button>
          }
        >
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: urls.dependencies(card.id),
              defaultEntry: { id: card.id, type: "card" },
            }}
          >
            <Box h={GRAPH_PANEL_HEIGHT}>
              <PLUGIN_DEPENDENCIES.DependencyGraphPage />
            </Box>
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        </DetailPanel>
      )}

      <DetailPanel title={t`History`}>
        <Box maw={800}>
          <MetricActivityTimeline card={card} />
        </Box>
      </DetailPanel>
    </DetailPageLayout>
  );
}

function DeltaText({
  change,
  label,
}: {
  change: number | null;
  label: string;
}) {
  if (change == null) {
    return null;
  }

  const formatted = `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}%`;

  return (
    <Text size="sm" fw={500} c={change >= 0 ? "success" : "error"}>
      {`${formatted} ${label}`}
    </Text>
  );
}

/** Read-only view of the metric's query, set up like `MetricQueryPage` minus the save path. */
function MetricDefinitionPreview({ card }: { card: CardApiType }) {
  const buildQuestion = useQuestionFromCard();
  const question = useMemo(() => buildQuestion(card), [buildQuestion, card]);
  const [uiState, setUiState] = useState(getInitialUiState);

  return (
    <Box mih={240}>
      <MetricQueryEditor
        query={question.query()}
        uiState={uiState}
        readOnly
        onChangeQuery={_.noop}
        onChangeUiState={setUiState}
      />
    </Box>
  );
}
