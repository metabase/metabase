import { useEffect, useMemo, useState } from "react";

import { useGetExplorationQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Group } from "metabase/ui";
import type { Exploration, ExplorationQueryId } from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import { ExplorationSidebar } from "../components/ExplorationSidebar";
import { ExplorationVisualization } from "../components/ExplorationVisualization/ExplorationVisualization";

const QUERY_POLL_INTERVAL_MS = 2000;

interface ExplorationPageProps {
  params: { id: string };
}

function hasUnsettledQueries(exploration: Exploration | undefined): boolean {
  if (!exploration?.threads) {
    return false;
  }
  return exploration.threads.some((thread) =>
    thread.queries?.some((q) => !isSettledExplorationQueryStatus(q.status)),
  );
}

export function ExplorationPage({ params }: ExplorationPageProps) {
  // Poll the exploration while any query is still in a non-terminal state.
  // RTK Query reads `pollingInterval` on every render, so deriving it from
  // the response is enough — passing 0 stops polling.
  const [shouldPoll, setShouldPoll] = useState(true);
  const {
    data: exploration,
    isLoading,
    error,
  } = useGetExplorationQuery(Number(params.id), {
    pollingInterval: shouldPoll ? QUERY_POLL_INTERVAL_MS : 0,
  });

  useEffect(() => {
    setShouldPoll(hasUnsettledQueries(exploration));
  }, [exploration]);
  const [selectedQueryId, setSelectedQueryId] =
    useState<ExplorationQueryId | null>(null);

  useEffect(() => {
    if (!exploration || selectedQueryId !== null) {
      return;
    }
    if (exploration?.threads?.[0]?.queries?.[0]?.id) {
      setSelectedQueryId(exploration.threads[0].queries[0].id);
    }
  }, [exploration, selectedQueryId]);

  const explorationQueriesById = useMemo(() => {
    return new Map(
      exploration?.threads?.flatMap(
        (thread) => thread.queries?.map((q) => [q.id, q]) ?? [],
      ) ?? [],
    );
  }, [exploration]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!exploration) {
    return null;
  }

  return (
    <Center p="3rem" h="100%" bg="background-secondary">
      <Group
        h="100%"
        w="100%"
        maw="90rem"
        align="flex-start"
        wrap="nowrap"
        gap="xl"
      >
        <ExplorationSidebar
          exploration={exploration}
          selectedQueryId={selectedQueryId}
          setSelectedQueryId={setSelectedQueryId}
        />
        {selectedQueryId && explorationQueriesById.get(selectedQueryId) && (
          <ExplorationVisualization
            explorationQuery={explorationQueriesById.get(selectedQueryId)!}
          />
        )}
      </Group>
    </Center>
  );
}
