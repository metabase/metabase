import { useState, useMemo } from "react";
import * as React from "react";
import reactAnsiStyle from "react-ansi-style";
import { t } from "ttag";
import _ from "underscore";

import Select, { Option } from "metabase/core/components/Select";

import { LogsContainer, LogsContent } from "./Logs.styled";
import { usePollingLogsQuery, useTailLogs } from "./hooks";
import { filterLogs, formatLog, getAllProcessUUIDs } from "./utils";

interface LogsProps {
  // NOTE: fetching logs could come back from any machine if there's multiple machines backing a MB isntance
  // make this frequent enough that you will most likely get every log from every machine in some reasonable
  // amount of time
  pollingDurationMs?: number;
}

export const Logs = ({ pollingDurationMs = 1000 }: LogsProps) => {
  const [selectedProcessUUID, setSelectedProcessUUID] = useState("ALL");
  const { loaded, error, logs } = usePollingLogsQuery(pollingDurationMs);
  const processUUIDs = useMemo(() => getAllProcessUUIDs(logs), [logs]);
  const filteredLogs = useMemo(
    () => filterLogs(logs, selectedProcessUUID),
    [logs, selectedProcessUUID],
  );
  const { scrollRef, onScroll, refollow } = useTailLogs(filteredLogs);

  const displayLogs = useMemo(() => {
    const noResults = filteredLogs.length === 0;
    const logText = noResults
      ? t`There's nothing here, yet.`
      : filteredLogs.map(formatLog).join("\n");
    return reactAnsiStyle(React, logText);
  }, [filteredLogs]);

  return (
    <LogsContainer loading={!loaded} error={error}>
      {processUUIDs.length > 1 && (
        <div className="pb1">
          <label>{t`Select Metabase process:`}</label>
          <Select
            defaultValue="ALL"
            value={selectedProcessUUID}
            onChange={(e: { target: { value: string } }) => {
              refollow();
              setSelectedProcessUUID(e.target.value);
            }}
            className="inline-block ml1"
            width={400}
          >
            <Option value="ALL" key="ALL">{t`All Metabase processes`}</Option>
            {processUUIDs.map(uuid => (
              <Option key={uuid} value={uuid}>
                <code>{uuid}</code>
              </Option>
            ))}
          </Select>
        </div>
      )}

      <LogsContent id="logs-content" ref={scrollRef} onScroll={onScroll}>
        {displayLogs}
      </LogsContent>
    </LogsContainer>
  );
};
