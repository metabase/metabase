import cx from "classnames";
import type { Location } from "history";
import * as React from "react";
import { useMemo } from "react";
import reactAnsiStyle from "react-ansi-style";
import { withRouter } from "react-router";
import { t } from "ttag";

import { useUrlState } from "metabase/common/hooks/use-url-state";
import Select, { Option } from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import { openSaveDialog } from "metabase/lib/dom";
import { Box, Button, Flex, Icon } from "metabase/ui";

import { LogsContainer, LogsContent } from "./Logs.styled";
import { usePollingLogsQuery, useTailLogs } from "./hooks";
import {
  filterLogs,
  formatLog,
  getAllProcessUUIDs,
  urlStateConfig,
} from "./utils";

interface LogsProps {
  location: Location;
  // NOTE: fetching logs could come back from any machine if there's multiple machines backing a MB isntance
  // make this frequent enough that you will most likely get every log from every machine in some reasonable
  // amount of time
  pollingDurationMs?: number;
}

export const DEFAULT_POLLING_DURATION_MS = 1000;

const LogsBase = ({
  location,
  pollingDurationMs = DEFAULT_POLLING_DURATION_MS,
}: LogsProps) => {
  const [{ process, query }, { patchUrlState }] = useUrlState(
    location,
    urlStateConfig,
  );
  const { loaded, error, logs } = usePollingLogsQuery(pollingDurationMs);
  const processUUIDs = useMemo(() => getAllProcessUUIDs(logs), [logs]);
  const filteredLogs = useMemo(
    () => filterLogs(logs, { process, query }),
    [logs, process, query],
  );
  const { scrollRef, onScroll, refollow } = useTailLogs(filteredLogs);

  const displayLogs = useMemo(() => {
    const noResults = filteredLogs.length === 0;
    const logText = noResults
      ? t`There's nothing here, yet.`
      : filteredLogs.map(formatLog).join("\n");
    return reactAnsiStyle(React, logText);
  }, [filteredLogs]);

  const handleDownload = () => {
    const logs = filteredLogs.map(formatLog).join("\n");
    const blob = new Blob([logs], { type: "text/json" });
    openSaveDialog("logs.txt", blob);
  };

  return (
    <LogsContainer loading={!loaded} error={error}>
      <Flex align="center" justify="space-between" mb="md">
        {processUUIDs.length > 1 && (
          <Box>
            <label>{t`Select Metabase process:`}</label>
            <Select
              defaultValue="ALL"
              value={process}
              onChange={(e: { target: { value: string } }) => {
                refollow();
                patchUrlState({ process: e.target.value });
              }}
              className={cx(CS.inlineBlock, CS.ml1)}
              width={400}
            >
              <Option value="ALL" key="ALL">{t`All Metabase processes`}</Option>
              {processUUIDs.map((uuid) => (
                <Option key={uuid} value={uuid}>
                  <code>{uuid}</code>
                </Option>
              ))}
            </Select>
          </Box>
        )}

        <Button
          disabled={filteredLogs.length === 0}
          leftSection={<Icon name="download" />}
          variant="filled"
          onClick={handleDownload}
        >{t`Download`}</Button>
      </Flex>

      <LogsContent id="logs-content" ref={scrollRef} onScroll={onScroll}>
        {displayLogs}
      </LogsContent>
    </LogsContainer>
  );
};

export const Logs = withRouter(LogsBase);
