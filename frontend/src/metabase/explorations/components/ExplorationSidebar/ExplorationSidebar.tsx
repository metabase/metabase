import cx from "classnames";
import { t } from "ttag";

import {
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type {
  Exploration,
  ExplorationQuery,
  ExplorationQueryId,
  ExplorationQueryStatus,
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
            <Stack mih={0} gap="xs" pr="md" className={S.threadList}>
              {thread.queries.map((query) =>
                query.name ? (
                  <ExplorationQueryRow
                    key={query.id}
                    query={query}
                    isSelected={selectedQueryId === query.id}
                    onSelect={() => setSelectedQueryId(query.id)}
                  />
                ) : null,
              )}
            </Stack>
          ) : (
            <Text c="text-secondary">{t`No charts were generated.`}</Text>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

interface ExplorationQueryRowProps {
  query: ExplorationQuery;
  isSelected: boolean;
  onSelect: () => void;
}

function ExplorationQueryRow({
  query,
  isSelected,
  onSelect,
}: ExplorationQueryRowProps) {
  const errorMessage =
    query.status === "error" && query.error_message
      ? query.error_message
      : null;

  const row = (
    <UnstyledButton
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.queryRow, {
        [S.queryRowSelected]: isSelected,
      })}
      onClick={onSelect}
    >
      <ExplorationQueryStatusIcon status={query.status} />
      <Text component="span" lineClamp={1}>
        {query.name}
      </Text>
    </UnstyledButton>
  );

  if (errorMessage) {
    return (
      <Tooltip
        className={S.errorTooltip}
        label={errorMessage}
        multiline
        maw="20rem"
        position="right"
      >
        {row}
      </Tooltip>
    );
  }

  return row;
}

const STATUS_ARIA_LABELS: Record<ExplorationQueryStatus, () => string> = {
  pending: () => t`Generating chart…`,
  running: () => t`Generating chart…`,
  done: () => t`Chart ready`,
  error: () => t`Failed to generate chart`,
};

function ExplorationQueryStatusIcon({
  status,
}: {
  status: ExplorationQueryStatus;
}) {
  const label = STATUS_ARIA_LABELS[status]();

  if (status === "pending" || status === "running") {
    return <Loader size="xs" aria-label={label} />;
  }

  if (status === "error") {
    return <Icon name="warning" c="error" aria-label={label} />;
  }

  return <Icon name="document" c="text-secondary" aria-label={label} />;
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
