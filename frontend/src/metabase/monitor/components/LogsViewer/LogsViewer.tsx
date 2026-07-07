import cx from "classnames";
import { type ComponentPropsWithoutRef, forwardRef, useMemo } from "react";
import { t } from "ttag";

import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import type { Log } from "metabase-types/api";

import S from "./LogsViewer.module.css";
import { createLogFormatter, getAllProcessUUIDs } from "./utils";

type LogsViewerProps = ComponentPropsWithoutRef<"div"> & {
  logs: Log[];
  /** Process UUID to display logs for; with "ALL" each line is prefixed with its process UUID when there are multiple. */
  process?: string;
  /** UUIDs of all known processes; defaults to the ones present in `logs`. */
  processUUIDs?: string[];
  emptyMessage?: string;
};

export const LogsViewer = forwardRef<HTMLDivElement, LogsViewerProps>(
  function LogsViewer(
    { logs, process = "ALL", processUUIDs, emptyMessage, className, ...rest },
    ref,
  ) {
    const logText = useMemo(() => {
      const formatLog = createLogFormatter(
        process,
        processUUIDs ?? getAllProcessUUIDs(logs),
      );
      return logs.flatMap(formatLog).join("\n");
    }, [logs, process, processUUIDs]);

    return (
      <AnsiLogs
        ref={ref}
        className={cx(S.logsViewer, className)}
        role="region"
        aria-label={t`Logs`}
        tabIndex={0}
        {...rest}
      >
        {logText || emptyMessage}
      </AnsiLogs>
    );
  },
);
