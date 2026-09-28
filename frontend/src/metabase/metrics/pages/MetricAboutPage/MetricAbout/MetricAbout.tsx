import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

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
import { trackMetricPageShowMoreClicked } from "metabase/metrics/analytics";
import { MetricActivityTimeline } from "metabase/metrics/components/MetricActivityTimeline";
import { useVisibleDimensions } from "metabase/metrics/components/MetricDimensionGrid";
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
  /** Dimension management and revision history, shown only in Data Studio. */
  showManagementPanels?: boolean;
}

const GRAPH_PANEL_HEIGHT = 360;

export function MetricAbout({
  card,
  metadata,
  urls,
  showManagementPanels = false,
}: MetricAboutProps) {
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(
    null,
  );
  const {
    activeDimensionId,
    activeDimensionSelectLabel,
    data,
    defaultDimensionId,
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
  const { cards: visiblePillOptions, showMore } = useVisibleDimensions(
    pillOptions,
    card.id,
  );
  // The curated default can sit past the visible cutoff; keep its pill visible so the
  // initially charted dimension is always shown as pressed.
  const shownPillOptions = useMemo(() => {
    const defaultOption = pillOptions.find(
      (option) => option.value === defaultDimensionId,
    );
    if (
      !defaultOption ||
      visiblePillOptions.some((option) => option.value === defaultDimensionId)
    ) {
      return visiblePillOptions;
    }
    return [...visiblePillOptions, defaultOption];
  }, [pillOptions, visiblePillOptions, defaultDimensionId]);
  const hasHiddenPillOptions = shownPillOptions.length < pillOptions.length;

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
            options={shownPillOptions}
            value={activeDimensionId}
            onChange={setSelectedDimensionId}
            onShowMore={
              hasHiddenPillOptions
                ? () => {
                    trackMetricPageShowMoreClicked(card.id);
                    showMore();
                  }
                : undefined
            }
          />
        )}
      </Card>

      <DetailPanel
        flush
        collapsible
        defaultCollapsed
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

      {showManagementPanels && (
        <DetailPanel title={t`Dimensions`}>
          <MetricDimensions metricId={card.id} queryMetadata={metadata} />
        </DetailPanel>
      )}

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

      {showManagementPanels && (
        <DetailPanel title={t`History`}>
          <Box maw={800}>
            <MetricActivityTimeline card={card} />
          </Box>
        </DetailPanel>
      )}
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
  const question = useQuestionFromCard(card);
  const [uiState, setUiState] = useState(getInitialUiState);

  return (
    <Box mih={240} data-testid="metric-definition">
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
