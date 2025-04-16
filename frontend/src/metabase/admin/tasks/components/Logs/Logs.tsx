import type { Location } from "history";
import * as React from "react";
import { useMemo } from "react";
import reactAnsiStyle from "react-ansi-style";
import { withRouter } from "react-router";
import { t } from "ttag";

import { useUrlState } from "metabase/common/hooks/use-url-state";
import Select, { Option } from "metabase/core/components/Select";
import { openSaveDialog } from "metabase/lib/dom";
import { Box, Button, Flex, Icon, TextInput } from "metabase/ui";

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
  const isAnyFilterApplied = process !== "ALL" || query.length > 0;
  const { scrollRef, onScroll, refollow } = useTailLogs(filteredLogs);
  const logText = useMemo(
    () => filteredLogs.map(formatLog).join("\n"),
    [filteredLogs],
  );

  const displayLogs = useMemo(() => {
    if (!logText) {
      return isAnyFilterApplied
        ? t`Nothing matches your filter.`
        : t`There's nothing here, yet.`;
    }

    return reactAnsiStyle(React, logText);
  }, [logText, isAnyFilterApplied]);

  const handleDownload = () => {
    const blob = new Blob([logText], { type: "text/json" });
    openSaveDialog("logs.txt", blob);
  };

  return (
    <LogsContainer loading={!loaded} error={error}>
      <Flex align="center" gap="md" justify="space-between" mb="md">
        <Flex align="center" gap="md">
          <TextInput
            placeholder={t`Filter logs`}
            rightSection={
              query.length > 0 ? (
                <Button
                  aria-label={t`Clear`}
                  c="text-dark"
                  leftSection={<Icon name="close" />}
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    patchUrlState({ query: "" });
                    refollow();
                  }}
                />
              ) : undefined
            }
            value={query}
            w={220} // set width to prevent CLS when the "Clear" button appears/disappears
            onChange={(event) => {
              patchUrlState({ query: event.target.value });
              refollow();
            }}
          />

          {processUUIDs.length > 1 && (
            <Box>
              <Select
                defaultValue="ALL"
                value={process}
                width={400}
                onChange={(e: { target: { value: string } }) => {
                  patchUrlState({ process: e.target.value });
                  refollow();
                }}
              >
                <Option
                  value="ALL"
                  key="ALL"
                >{t`All Metabase processes`}</Option>
                {processUUIDs.map((uuid) => (
                  <Option key={uuid} value={uuid}>
                    <code>{uuid}</code>
                  </Option>
                ))}
              </Select>
            </Box>
          )}
        </Flex>

        <Button
          disabled={logText.length === 0}
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
