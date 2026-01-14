import * as React from "react";
import { type DOMAttributes, type Ref, forwardRef, useMemo } from "react";
import reactAnsiStyle from "react-ansi-style";

import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import type { BoxProps } from "metabase/ui";
import type { Log } from "metabase-types/api";

import { LogsContent } from "./Logs.styled";
import { formatLog } from "./utils";

type LogsViewerProps = DOMAttributes<HTMLDivElement> &
  BoxProps & {
    logs: Log[];
  };

function LogsViewerInner(
  { logs, onScroll }: LogsViewerProps,
  ref: Ref<HTMLDivElement>,
) {
  const logText = useMemo(() => logs.map(formatLog).join("\n"), [logs]);
  const displayLogs = useMemo(() => {
    return reactAnsiStyle(React, logText);
  }, [logText]);

  return (
    <AnsiLogs ref={ref} onScroll={onScroll} component={LogsContent}>
      {displayLogs}
    </AnsiLogs>
  );
}

export const LogsViewer = forwardRef(LogsViewerInner);
