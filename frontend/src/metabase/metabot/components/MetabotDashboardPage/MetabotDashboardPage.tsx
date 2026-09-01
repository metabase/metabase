import { useMemo } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  getConversationStateById,
  getMetabotState,
} from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import { useParams } from "metabase/router";
import { Box, Center, Stack, Text, Title } from "metabase/ui";
import { GRID_WIDTH } from "metabase/utils/dashboard_grid";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import { getDatasetError, getGenericErrorMessage } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  DatasetQuery,
  MetabotStateContext,
} from "metabase-types/api";

import { useGetMetabotConversationQuery } from "../../api";

type ConversationDashboardTile = {
  title: string;
  chart_id?: string;
  query_id?: string;
  row: number;
  col: number;
  size_x: number;
  size_y: number;
};

type ConversationDashboard = {
  name: string;
  description?: string;
  tiles: ConversationDashboardTile[];
};

type ResolvedTile = ConversationDashboardTile & {
  query: DatasetQuery;
  display: CardDisplayType;
};

function resolveTiles(
  context: MetabotStateContext,
  dashboard: ConversationDashboard,
): ResolvedTile[] {
  return dashboard.tiles.flatMap((tile) => {
    const chart =
      tile.chart_id != null ? context.charts?.[tile.chart_id] : undefined;
    const query: DatasetQuery | undefined =
      chart != null
        ? (chart.queries?.[0] ?? context.queries?.[chart.query_id])
        : context.queries?.[tile.query_id ?? ""];
    if (query == null || tile.size_x == null) {
      return [];
    }
    const display: CardDisplayType =
      chart?.visualization_settings?.chart_type ?? "table";
    return [{ ...tile, query, display }];
  });
}

function DashboardTile({ tile }: { tile: ResolvedTile }) {
  const card = useMemo(
    () =>
      new Question({
        dataset_query: tile.query,
        display: tile.display,
        displayIsLocked: true,
        visualization_settings: {},
        name: tile.title,
      }).card(),
    [tile],
  );

  const { data: dataset, error } = useGetAdhocQueryQuery(tile.query);
  const rawSeries = useMemo(
    () => (dataset ? [{ card, data: dataset.data }] : null),
    [card, dataset],
  );

  const datasetError = dataset ? getDatasetError(dataset) : undefined;
  const requestError = error
    ? { message: getGenericErrorMessage(), icon: "warning" as const }
    : undefined;
  const tileError = datasetError ?? requestError;

  return (
    <Box
      bd="1px solid var(--mb-color-border)"
      bdrs="md"
      p="md"
      mih={0}
      data-testid="metabot-dashboard-tile"
      style={{
        gridColumn: `${tile.col + 1} / span ${tile.size_x}`,
        gridRow: `${tile.row + 1} / span ${tile.size_y}`,
      }}
    >
      <Stack gap="sm" h="100%">
        <Text fw="bold" truncate>
          {tile.title}
        </Text>
        <Box flex={1} mih={0}>
          {tileError ? (
            <Center h="100%">
              <ErrorView error={tileError.message} icon={tileError.icon} />
            </Center>
          ) : !rawSeries ? (
            <LoadingAndErrorWrapper loading />
          ) : (
            <Visualization
              rawSeries={rawSeries}
              isQueryBuilder={false}
              onChangeCardAndRun={noop}
            />
          )}
        </Box>
      </Stack>
    </Box>
  );
}

export const MetabotDashboardPage = () => {
  const { convoId, dashboardId } = useParams<{
    convoId: string;
    dashboardId: string;
  }>();

  const conversationState = useSelector((state) =>
    convoId != null ? getConversationStateById(state, convoId) : undefined,
  );
  const isConversationInProgress = useSelector(
    (state) =>
      convoId != null &&
      (getMetabotState(state).conversations[convoId]?.isProcessing ?? false),
  );

  const hasLocalDashboard =
    dashboardId != null && conversationState?.dashboards?.[dashboardId] != null;
  const { data: conversation, isLoading } = useGetMetabotConversationQuery(
    convoId == null || hasLocalDashboard ? skipToken : convoId,
  );

  const context: MetabotStateContext | undefined = hasLocalDashboard
    ? conversationState
    : conversation?.state;
  const dashboard: ConversationDashboard | undefined =
    dashboardId != null ? context?.dashboards?.[dashboardId] : undefined;

  if (dashboard == null || context == null) {
    if (isLoading || isConversationInProgress) {
      return <LoadingAndErrorWrapper loading />;
    }
    return (
      <Center h="100%" p="xl">
        <Text c="text-secondary">{t`This dashboard is no longer available.`}</Text>
      </Center>
    );
  }

  const tiles = resolveTiles(context, dashboard);

  return (
    <Box p="xl" mx="auto" maw="80rem" data-testid="metabot-dashboard-page">
      <Title order={1}>{dashboard.name}</Title>
      {dashboard.description != null && (
        <Text c="text-secondary" mt="xs">
          {dashboard.description}
        </Text>
      )}
      <Box
        mt="lg"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_WIDTH}, 1fr)`,
          gridAutoRows: "3.5rem",
          gap: "0.5rem",
        }}
      >
        {tiles.map((tile, index) => (
          <DashboardTile key={index} tile={tile} />
        ))}
      </Box>
    </Box>
  );
};
