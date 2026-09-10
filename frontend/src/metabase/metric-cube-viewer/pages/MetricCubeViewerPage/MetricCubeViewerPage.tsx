import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLocation, useParams } from "metabase/router";
import { Box, Center, Stack } from "metabase/ui";

import {
  trackMetricCubeViewerCardRemoved,
  trackMetricCubeViewerViewed,
} from "../../analytics";
import {
  CardActionsMenu,
  CardEditorModal,
  CardGrid,
  CubeViewerHeader,
  CubeViewerSkeleton,
  FilterBar,
  OverviewRow,
  SettingsModal,
} from "../../components";
import {
  MetricCubeViewerProvider,
  useMetricCubeViewerContext,
} from "../../context";
import { getCardGenerator } from "../../generators";
import { useCubeCatalog } from "../../hooks/use-cube-catalog";
import { useCubeViewerState } from "../../hooks/use-cube-viewer-state";
import { useResetViewerConfirmation } from "../../hooks/use-reset-viewer-confirmation";
import type { CubeCard } from "../../types";

const GENERATOR_SEARCH_PARAM = "generator";

type EditorState = { isOpen: false } | { isOpen: true; card?: CubeCard };

export function MetricCubeViewerPage() {
  const { tableId: tableIdParam = "" } = useParams<{ tableId: string }>();
  const tableId = parseInt(tableIdParam, 10);
  const location = useLocation();

  const requestedGeneratorId = new URLSearchParams(location.search).get(
    GENERATOR_SEARCH_PARAM,
  );
  const generator = useMemo(
    () => getCardGenerator(requestedGeneratorId),
    [requestedGeneratorId],
  );

  const { catalog, definitions, isLoading, error } = useCubeCatalog(tableId);
  const { data: table } = useGetTableQueryMetadataQuery(
    Number.isNaN(tableId) ? skipToken : { id: tableId },
  );
  const { state, actions } = useCubeViewerState({ catalog, generator });

  useEffect(() => {
    trackMetricCubeViewerViewed(generator.id);
  }, [generator.id]);

  const contextValue = useMemo(
    () =>
      catalog && state
        ? { catalog, definitions, state, actions, generator }
        : null,
    [catalog, definitions, state, actions, generator],
  );

  if (error) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  if (catalog && catalog.measures.length === 0) {
    return (
      <Center h="100%">
        <EmptyState
          icon="ruler"
          title={t`This table doesn't have any measures yet.`}
        />
      </Center>
    );
  }

  if (isLoading || !contextValue) {
    return (
      <Box px="3rem" py="xl">
        <CubeViewerSkeleton />
      </Box>
    );
  }

  return (
    <MetricCubeViewerProvider value={contextValue}>
      <MetricCubeViewerPageBody
        title={table?.display_name ?? table?.name ?? ""}
      />
    </MetricCubeViewerProvider>
  );
}

function MetricCubeViewerPageBody({ title }: { title: string }) {
  const { state, actions, generator } = useMetricCubeViewerContext();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ isOpen: false });
  const { confirmReset, modalContent: resetConfirmation } =
    useResetViewerConfirmation();

  const { overviewCards, gridCards } = useMemo(
    () => ({
      overviewCards: state.cards.filter((card) => card.kind === "overview"),
      gridCards: state.cards.filter((card) => card.kind !== "overview"),
    }),
    [state.cards],
  );

  const closeEditor = useCallback(() => setEditor({ isOpen: false }), []);

  const renderCardActions = (card: CubeCard) => (
    <CardActionsMenu
      onEdit={() => setEditor({ isOpen: true, card })}
      onRemove={() => {
        actions.removeCard(card.id);
        trackMetricCubeViewerCardRemoved(generator.id);
      }}
    />
  );

  return (
    <Stack px="3rem" py="xl" gap="xl" data-testid="metric-cube-viewer">
      <CubeViewerHeader
        title={title}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onReset={confirmReset}
      />
      <FilterBar />
      <OverviewRow
        cards={overviewCards}
        renderCardActions={
          state.mode === "fine" ? renderCardActions : undefined
        }
      />
      <CardGrid
        cards={gridCards}
        renderCardActions={renderCardActions}
        onAddCard={() => setEditor({ isOpen: true })}
      />
      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {editor.isOpen && (
        <CardEditorModal card={editor.card} onClose={closeEditor} />
      )}
      {resetConfirmation}
    </Stack>
  );
}
