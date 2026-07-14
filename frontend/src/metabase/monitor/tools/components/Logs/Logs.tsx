import type { Location } from "history";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import {
  LogsViewer,
  createLogFormatter,
  getAllProcessUUIDs,
} from "metabase/monitor/components/LogsViewer";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Link, withRouter } from "metabase/router";
import {
  Button,
  Center,
  DefaultSelectItem,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  Select,
  Stack,
  TextInput,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { openSaveDialog } from "metabase/utils/dom";

import S from "./Logs.module.css";
import { usePollingLogsQuery, useTailLogs } from "./hooks";
import { filterLogs, urlStateConfig } from "./utils";

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
    () => filterLogs(logs, { process, query }, processUUIDs),
    [logs, process, query, processUUIDs],
  );
  const hasAnyLogs = logs.length > 0;
  const hasFilteredLogs = filteredLogs.length > 0;
  const { scrollRef, onScroll, refollow } = useTailLogs(filteredLogs);

  const handleDownload = () => {
    const formatLog = createLogFormatter(process, processUUIDs);
    const logText = filteredLogs.flatMap(formatLog).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    openSaveDialog("logs.txt", blob);
  };

  return (
    <>
      <Flex h="100%" wrap="nowrap">
        <Stack className={S.main} flex={1} gap="md">
          <MonitorHeaderTitle mb="sm">{t`Logs`}</MonitorHeaderTitle>

          {!loaded || error != null ? (
            <Center flex={1}>
              <DelayedLoadingAndErrorWrapper loading={!loaded} error={error} />
            </Center>
          ) : (
            <>
              <Group gap="md" align="center" wrap="nowrap">
                <TextInput
                  flex={1}
                  miw="8rem"
                  leftSection={<FixedSizeIcon name="search" />}
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
                  onChange={(event) => {
                    patchUrlState({ query: event.target.value });
                    refollow();
                  }}
                />

                {processUUIDs.length > 1 && (
                  <Select
                    value={process}
                    comboboxProps={{ width: 400, position: "bottom-start" }}
                    data={[
                      { value: "ALL", label: t`All Metabase processes` },
                      ...processUUIDs.map((uuid) => ({
                        value: uuid,
                        label: uuid,
                      })),
                    ]}
                    renderOption={(item) => (
                      <DefaultSelectItem
                        {...item.option}
                        selected={item.checked}
                        label={
                          item.option.value === "ALL" ? (
                            item.option.label
                          ) : (
                            <code>{item.option.label}</code>
                          )
                        }
                      />
                    )}
                    onChange={(value) => {
                      if (value !== null) {
                        patchUrlState({ process: value });
                        refollow();
                      }
                    }}
                  />
                )}

                <Button
                  component={Link}
                  to={Urls.monitorLogLevels()}
                  leftSection={<Icon name="pulse" />}
                  variant="default"
                >{t`Customize log levels`}</Button>

                <Button
                  disabled={!hasFilteredLogs}
                  leftSection={<Icon name="download" />}
                  variant="filled"
                  onClick={handleDownload}
                >{t`Download`}</Button>
              </Group>

              <LogsViewer
                ref={scrollRef}
                logs={filteredLogs}
                processUUID={process}
                processUUIDs={processUUIDs}
                emptyMessage={
                  hasAnyLogs
                    ? t`Nothing matches your filters.`
                    : t`There's nothing here, yet.`
                }
                aria-label={t`Logs output`}
                onScroll={onScroll}
              />
            </>
          )}
        </Stack>
      </Flex>

      {
        // render 'children' so that the modals show up
        children
      }
    </>
  );
};

export const Logs = withRouter(LogsBase);
