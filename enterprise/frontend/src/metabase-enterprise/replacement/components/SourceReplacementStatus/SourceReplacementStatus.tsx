import { useEffect, useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { Api, skipToken, useGetCardQuery } from "metabase/api";
import { useGetTableQuery } from "metabase/api/table";
import type { TagType } from "metabase/api/tags";
import { useDispatch } from "metabase/redux";
import StatusLarge from "metabase/status/components/StatusLarge";
import StatusSmall from "metabase/status/components/StatusSmall";
import {
  getIconName,
  isSpinnerVisible,
} from "metabase/status/components/utils/status";
import useStatusVisibility from "metabase/status/hooks/use-status-visibility";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import {
  useGetSourceReplacementRunQuery,
  useListSourceReplacementRunsQuery,
} from "metabase-enterprise/api/replacement";
import type {
  Card,
  LongTaskStatus,
  SourceReplacementRun,
  SourceReplacementRunId,
  Table,
} from "metabase-types/api";

const POLLING_INTERVAL = 2000;

const INVALIDATION_TAGS: TagType[] = [
  "table",
  "card",
  "segment",
  "measure",
  "transform",
];

export const SourceReplacementStatus = () => {
  const { run, isActive } = useCurrentRun();
  const dispatch = useDispatch();
  const isVisible = useStatusVisibility(isActive);

  useEffect(() => {
    if (!isActive && isVisible) {
      dispatch(Api.util.invalidateTags(INVALIDATION_TAGS));
    }
  }, [isActive, isVisible, dispatch]);

  if (run == null || !isVisible) {
    return null;
  }

  return <RunStatusContent run={run} />;
};

function useCurrentRun() {
  const [runId, setRunId] = useState<SourceReplacementRunId | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingInterval = isPolling ? POLLING_INTERVAL : undefined;

  const { data: activeRuns = [] } = useListSourceReplacementRunsQuery(
    { "is-active": true },
    { pollingInterval },
  );
  const { data: currentRun } = useGetSourceReplacementRunQuery(
    runId ?? skipToken,
    { pollingInterval },
  );
  const isActive = activeRuns.length > 0;

  useLayoutEffect(() => {
    if (isActive) {
      setRunId(activeRuns[0].id);
    }
  }, [activeRuns, isActive]);

  useLayoutEffect(() => {
    setIsPolling(isActive);
  }, [isActive]);

  return { run: currentRun, isActive };
}

type RunStatusContentProps = {
  run: SourceReplacementRun;
};

const RunStatusContent = ({ run }: RunStatusContentProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return isExpanded ? (
    <RunStatusLarge run={run} onCollapse={() => setIsExpanded(false)} />
  ) : (
    <RunStatusSmall run={run} onExpand={() => setIsExpanded(true)} />
  );
};

type RunStatusSmallProps = {
  run: SourceReplacementRun;
  onExpand: () => void;
};

const RunStatusSmall = ({ run, onExpand }: RunStatusSmallProps) => {
  const status = getStatus(run);
  const statusLabel = getStatusLabel(run);
  const icon = getIconName(status);
  const hasSpinner = isSpinnerVisible(status);

  return (
    <StatusSmall
      status={status}
      statusLabel={statusLabel}
      icon={icon}
      hasSpinner={hasSpinner}
      onExpand={onExpand}
    />
  );
};

type RunStatusLargeProps = {
  run: SourceReplacementRun;
  onCollapse: () => void;
};

const RunStatusLarge = ({ run, onCollapse }: RunStatusLargeProps) => {
  const { data: table } = useGetTableQuery(
    { id: run.source_entity_id },
    { skip: run.source_entity_type !== "table" },
  );
  const { data: card } = useGetCardQuery(
    { id: run.source_entity_id },
    { skip: run.source_entity_type !== "card" },
  );

  const status = {
    title: getStatusLabel(run),
    items: [
      {
        id: run.id,
        title: getStatusItemTitle(run, table, card),
        icon: getStatusItemIcon(run, card),
        description: getStatusItemDescription(run),
        isInProgress: run.status === "started",
        isCompleted: run.status === "succeeded",
        isAborted:
          run.status === "failed" ||
          run.status === "canceled" ||
          run.status === "timeout",
      },
    ],
  };

  return <StatusLarge status={status} onCollapse={onCollapse} isActive />;
};

function getStatus(run: SourceReplacementRun): LongTaskStatus {
  switch (run.status) {
    case "started":
      return "incomplete";
    case "succeeded":
      return "complete";
    default:
      return "aborted";
  }
}

function getStatusLabel(run: SourceReplacementRun): string {
  switch (run.status) {
    case "started":
      return t`Replacing data source…`;
    case "succeeded":
      return t`Done!`;
    default:
      return t`Error replacing`;
  }
}

function getStatusItemTitle(
  run: SourceReplacementRun,
  table: Table | undefined,
  card: Card | undefined,
): string {
  if (run.source_entity_type === "table") {
    return table?.display_name ?? "";
  }
  if (run.source_entity_type === "card") {
    return card?.name ?? "";
  }
  return "";
}

function getStatusItemIcon(
  run: SourceReplacementRun,
  card: Card | undefined,
): IconName {
  if (run.source_entity_type === "table") {
    return "table";
  }
  if (run.source_entity_type === "card") {
    const visualization =
      card != null ? visualizations.get(card.display) : null;
    return visualization?.iconName ?? "table2";
  }
  return "table";
}

function getStatusItemDescription(
  run: SourceReplacementRun,
): string | undefined {
  if (run.status === "started") {
    if (run.progress != null) {
      const percentage = Math.round(run.progress * 100);
      return t`${percentage}% complete`;
    }
  }
  return undefined;
}
