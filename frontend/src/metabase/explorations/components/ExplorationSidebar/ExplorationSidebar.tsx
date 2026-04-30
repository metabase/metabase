import { t } from "ttag";

import { Button, Stack, Text } from "metabase/ui";
import type {
  Exploration,
  ExplorationQueryId,
  ExplorationThread,
} from "metabase-types/api";

import S from "./ExplorationSidebar.module.css";

interface ExplorationSidebarProps {
  exploration: Exploration;
  selectedQueryId: ExplorationQueryId | null;
  setSelectedQueryId: (queryId: ExplorationQueryId) => void;
}

export function ExplorationSidebar({
  exploration,
  selectedQueryId,
  setSelectedQueryId,
}: ExplorationSidebarProps) {
  return (
    <Stack h="100%" gap="lg">
      <Text size="xl" fw="bold">
        {exploration.name}
      </Text>
      {exploration.threads?.map((thread, i) => (
        <Stack mih={0} key={thread.id} gap="md">
          <Text fw="bold">{getExplorationThreadName(thread, i)}</Text>
          {thread.queries && thread.queries.length > 0 ? (
            <Stack mih={0} gap="sm" pr="md" className={S.threadList}>
              {thread.queries.map((q) => {
                if (!q.name) {
                  return null;
                }
                return (
                  <Button
                    key={q.id}
                    onClick={() => setSelectedQueryId(q.id)}
                    flex="none"
                    variant={selectedQueryId === q.id ? "filled" : "default"}
                  >
                    {q.name}
                  </Button>
                );
              })}
            </Stack>
          ) : (
            <Text c="text-secondary">{t`No charts were generated.`}</Text>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

function getExplorationThreadName(thread: ExplorationThread, index: number) {
  if (thread.name) {
    return thread.name;
  }
  if (index === 0) {
    return t`Initial investigation`;
  }
  return t`New exploration`;
}
