import cx from "classnames";
import { type ComponentPropsWithoutRef, forwardRef, useMemo } from "react";
import { t } from "ttag";

import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import type { Log } from "metabase-types/api";

import S from "./LogsViewer.module.css";
import { createLogFormatter, getAllProcessUUIDs } from "./utils";

type LogsViewerProps = ComponentPropsWithoutRef<"div"> & {
  logs: Log[];
  processUUID?: string;
  processUUIDs?: string[];
  emptyMessage?: string;
};

export const LogsViewer = forwardRef<HTMLDivElement, LogsViewerProps>(
  function LogsViewer(
    {
      logs,
      processUUID = "ALL",
      processUUIDs,
      emptyMessage,
      className,
      ...rest
    },
    ref,
  ) {
    const logText = useMemo(() => {
      const formatLog = createLogFormatter(
        processUUID,
        processUUIDs ?? getAllProcessUUIDs(logs),
      );
      return logs.flatMap(formatLog).join("\n");
    }, [logs, processUUID, processUUIDs]);

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
