import { useState } from "react";
import { t } from "ttag";

import StatusLarge from "metabase/status/components/StatusLarge";
import StatusSmall from "metabase/status/components/StatusSmall";
import {
  getIconName,
  isSpinnerVisible,
} from "metabase/status/components/utils/status";
import useStatusVisibility from "metabase/status/hooks/use-status-visibility";
import { useListSourceReplacementRunsQuery } from "metabase-enterprise/api/replacement";
import type { LongTaskStatus, SourceReplacementRun } from "metabase-types/api";

export const SourceReplacementStatus = () => {
  const { data: runs = [] } = useListSourceReplacementRunsQuery({
    "is-active": true,
  });
  const isActive = runs.some((run) => run.status === "started");
  const isVisible = useStatusVisibility(isActive);

  if (!isVisible) {
    return null;
  }

  return <RunStatusContent runs={runs} />;
};

type RunStatusContentProps = {
  runs: SourceReplacementRun[];
};

const RunStatusContent = ({ runs }: RunStatusContentProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return isExpanded ? (
    <RunStatusLarge runs={runs} onCollapse={() => setIsExpanded(false)} />
  ) : (
    <RunStatusSmall runs={runs} onExpand={() => setIsExpanded(true)} />
  );
};

type RunStatusSmallProps = {
  runs: SourceReplacementRun[];
  onExpand: () => void;
};

const RunStatusSmall = ({ runs, onExpand }: RunStatusSmallProps) => {
  const status = getStatus(runs);
  const statusLabel = getStatusLabel(runs);
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
  runs: SourceReplacementRun[];
  onCollapse: () => void;
};

const RunStatusLarge = ({ runs, onCollapse }: RunStatusLargeProps) => {
  const status = {
    title: getStatusLabel(runs),
    items: runs.map((run) => ({
      id: run.id,
      title: "TODO",
      icon: run.source_entity_type === "table" ? "table" : "table2",
      description: getStatusDescription(run),
      isInProgress: run.status === "started",
      isCompleted: run.status === "succeeded",
      isAborted:
        run.status === "failed" ||
        run.status === "canceled" ||
        run.status === "timeout",
    })),
  };

  return <StatusLarge status={status} onCollapse={onCollapse} isActive />;
};

function getStatus(runs: SourceReplacementRun[]): LongTaskStatus {
  if (runs.some((run) => run.status === "started")) {
    return "incomplete";
  } else if (runs.some((run) => run.status === "succeeded")) {
    return "complete";
  } else {
    return "aborted";
  }
}

function getStatusLabel(runs: SourceReplacementRun[]): string {
  if (runs.some((run) => run.status === "started")) {
    return t`Replacing data source…`;
  } else if (runs.every((run) => run.status === "succeeded")) {
    return t`Done!`;
  } else {
    return t`Error replacing`;
  }
}

function getStatusDescription(run: SourceReplacementRun): string {
  switch (run.status) {
    case "started":
      return t`Replacing data source…`;
    case "succeeded":
      return t`Done!`;
    default:
      return t`Error replacing`;
  }
}
