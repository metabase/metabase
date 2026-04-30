import { useEffect, useMemo, useState } from "react";

import { useGetExplorationQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Group } from "metabase/ui";
import type { ExplorationQueryId } from "metabase-types/api";

import { ExplorationSidebar } from "../components/ExplorationSidebar";
import { ExplorationVisualization } from "../components/ExplorationVisualization/ExplorationVisualization";

interface ExplorationPageProps {
  params: { id: string };
}

export function ExplorationPage({ params }: ExplorationPageProps) {
  const {
    data: exploration,
    isLoading,
    error,
  } = useGetExplorationQuery(Number(params.id));
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
