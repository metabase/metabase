import * as React from "react";
import { useMemo } from "react";
import reactAnsiStyle from "react-ansi-style";

import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import type { Log } from "metabase-types/api";

import { LogsContent } from "./Logs.styled";
import { formatLog } from "./utils";

type LogsViewerProps = React.ComponentPropsWithoutRef<"div"> & {
  logs: Log[];
};

// TODO(egorgrushin): use it in frontend/src/metabase/admin/tools/components/Logs/Logs.tsx
export const LogsViewer = ({ logs, ...rest }: LogsViewerProps) => {
  const logText = useMemo(() => logs.map(formatLog).join("\n"), [logs]);
  const displayLogs = useMemo(() => reactAnsiStyle(React, logText), [logText]);

  return (
    <AnsiLogs component={LogsContent} {...rest}>
      {displayLogs}
    </AnsiLogs>
  );
};
