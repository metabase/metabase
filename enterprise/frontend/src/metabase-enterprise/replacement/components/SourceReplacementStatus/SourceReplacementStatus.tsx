import { useEffect, useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { Api, useGetCardQuery } from "metabase/api";
import { useGetTableQuery } from "metabase/api/table";
import { useDispatch } from "metabase/lib/redux";
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

export const SourceReplacementStatus = () => {
  const [runId, setRunId] = useState<SourceReplacementRunId | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const { data: runs = [] } = useListSourceReplacementRunsQuery(
    {
      "is-active": true,
    },
    {
      pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
    },
  );
  const dispatch = useDispatch();
  const activeRun = runs[0];
  const isActive = activeRun != null;
  const isVisible = useStatusVisibility(isActive);

  useLayoutEffect(() => {
    if (activeRun != null) {
      setRunId(activeRun.id);
    }
  }, [activeRun]);

  useLayoutEffect(() => {
    setIsPolling(isActive);
  }, [isActive]);

  useEffect(() => {
    if (!isActive && isVisible) {
      dispatch(
        Api.util.invalidateTags([
          "table",
          "card",
          "segment",
          "measure",
          "transform",
        ]),
      );
    }
  }, [isActive, isVisible, dispatch]);

  if (runId == null || !isVisible) {
    return null;
  }

  return <RunStatusContent runId={runId} activeRun={activeRun} />;
};

type RunStatusContentProps = {
  runId: SourceReplacementRunId;
  activeRun: SourceReplacementRun | undefined;
};

const RunStatusContent = ({ runId, activeRun }: RunStatusContentProps) => {
  const { data: run = activeRun } = useGetSourceReplacementRunQuery(runId, {
    skip: activeRun != null,
  });
  const [isExpanded, setIsExpanded] = useState(true);

  if (run == null) {
    return null;
  }

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

function getStatusItemDescription(run: SourceReplacementRun): string {
  switch (run.status) {
    case "started":
      return t`Replacing data source…`;
    case "succeeded":
      return t`Done!`;
    default:
      return t`Error replacing`;
  }
}
