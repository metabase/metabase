import type { Location } from "history";
import * as React from "react";
import { type ReactNode, useMemo } from "react";
import reactAnsiStyle from "react-ansi-style";
import { Link, withRouter } from "react-router";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import Select, { Option } from "metabase/common/components/Select";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { openSaveDialog } from "metabase/lib/dom";
import { Button, Flex, Icon, TextInput } from "metabase/ui";

import { LogsContainer, LogsContent } from "./Logs.styled";
import { usePollingLogsQuery, useTailLogs } from "./hooks";
import {
  filterLogs,
  formatLog,
  getAllProcessUUIDs,
  urlStateConfig,
} from "./utils";

interface LogsProps {
  children?: ReactNode;
  location: Location;
  // NOTE: fetching logs could come back from any machine if there's multiple machines backing a MB instance
  // make this frequent enough that you will most likely get every log from every machine in some reasonable
  // amount of time
  pollingDurationMs?: number;
}

export const DEFAULT_POLLING_DURATION_MS = 1000;

const LogsBase = ({
  children,
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
  const hasAnyLogs = logs.length > 0;
  const { scrollRef, onScroll, refollow } = useTailLogs(filteredLogs);
  const logText = useMemo(
    () => filteredLogs.map(formatLog).join("\n"),
    [filteredLogs],
  );

  const displayLogs = useMemo(() => {
    if (!logText) {
      return hasAnyLogs
        ? t`Nothing matches your filters.`
        : t`There's nothing here, yet.`;
    }

    return reactAnsiStyle(React, logText);
  }, [hasAnyLogs, logText]);

  const handleDownload = () => {
    const blob = new Blob([logText], { type: "text/json" });
    openSaveDialog("logs.txt", blob);
  };

  return (
    <>
      <SettingsPageWrapper title={t`Logs`}>
        <SettingsSection>
          <LogsContainer loading={!loaded} error={error}>
            <Flex align="center" gap="md" justify="space-between" mb="md">
              <Flex align="center" gap="md">
                <TextInput
                  placeholder={t`Filter logs`}
                  rightSection={
                    query.length > 0 ? (
                      <Button
                        aria-label={t`Clear`}
                        c="text-primary"
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
                )}
              </Flex>

              <Flex align="center" gap="md">
                <Button
                  component={Link}
                  to="/admin/tools/logs/levels"
                  leftSection={<Icon name="pulse" />}
                  variant="default"
                >{t`Customize log levels`}</Button>

                <Button
                  disabled={logText.length === 0}
                  leftSection={<Icon name="download" />}
                  variant="filled"
                  onClick={handleDownload}
                >{t`Download`}</Button>
              </Flex>
            </Flex>

            <AnsiLogs
              id="logs-content"
              ref={scrollRef}
              onScroll={onScroll}
              component={LogsContent}
            >
              {displayLogs}
            </AnsiLogs>
          </LogsContainer>
        </SettingsSection>
      </SettingsPageWrapper>

      {
        // render 'children' so that the modals show up
        children
      }
    </>
  );
};

export const Logs = withRouter(LogsBase);
