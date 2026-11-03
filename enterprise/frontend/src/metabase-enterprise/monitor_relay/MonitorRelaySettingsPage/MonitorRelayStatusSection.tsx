import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Table } from "metabase/common/components/Table";
import { SettingHeader, SettingsSection } from "metabase/settings-components";
import { Box, Group, Progress, SimpleGrid, Stack, Text } from "metabase/ui";
import { duration, formatNumber } from "metabase/utils/formatting";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import { useGetMonitorRelayStatusQuery } from "metabase-enterprise/api";
import type {
  MonitorRelayFeedStatus,
  MonitorRelayNode,
  MonitorRelayNodeState,
  MonitorRelayStateKind,
  MonitorRelayStatus,
  MonitorRelayStream,
} from "metabase-types/api";

import {
  MONITOR_NAME,
  STATUS_POLLING_INTERVAL_MS,
  URL_ENV_VAR,
  getHistoryProgress,
  getPhaseDescription,
  getPhaseLabel,
  getStateKindLabel,
  getStreamLabel,
} from "./utils";

export function MonitorRelayStatusSection() {
  const { data, error, isLoading } = useGetMonitorRelayStatusQuery(undefined, {
    pollingInterval: STATUS_POLLING_INTERVAL_MS,
  });

  return (
    <SettingsSection title={t`Status`}>
      <LoadingAndErrorWrapper loading={isLoading} error={data ? null : error}>
        {data && <StatusContent status={data} />}
      </LoadingAndErrorWrapper>
    </SettingsSection>
  );
}

function StatusContent({ status }: { status: MonitorRelayStatus }) {
  const { url, node, feed } = status;

  if (url.status === "unset") {
    return <Text>{t`No URL is set, so this instance sends nothing.`}</Text>;
  }

  if (url.status === "malformed") {
    return (
      <Text>{t`${URL_ENV_VAR} is not of the form <base>/ingest/<token>, so this instance sends nothing.`}</Text>
    );
  }

  return (
    <Stack gap="xl">
      <NodeState node={node} base={url.base} />
      {feed.status ? (
        <FeedStatus
          feed={feed.status}
          thisNodeId={node.node_id}
          statusAt={feed.at}
        />
      ) : feed.error ? (
        <StatusError error={feed.error} />
      ) : (
        <Text>{t`${MONITOR_NAME} has not answered yet.`}</Text>
      )}
    </Stack>
  );
}

function StatusError({ error }: { error: string }) {
  return (
    <Stack gap="xs">
      <Text>{t`Could not get the status from ${MONITOR_NAME}.`}</Text>
      <Text c="feedback-negative">{error}</Text>
    </Stack>
  );
}

function FeedStatus({
  feed,
  thisNodeId,
  statusAt,
}: {
  feed: MonitorRelayFeedStatus;
  thisNodeId: string;
  statusAt: string | null;
}) {
  return (
    <Stack gap="xl">
      <SimpleGrid cols={3}>
        <Fact
          label={t`Phase`}
          value={getPhaseLabel(feed.phase)}
          note={getPhaseDescription(feed.phase)}
        />
        <Fact
          label={t`Last processed`}
          value={
            feed.last_seal_at ? getRelativeTime(feed.last_seal_at) : t`Never`
          }
        />
      </SimpleGrid>
      <StreamsTable streams={feed.streams} />
      <StateTable state={feed.state} />
      <NodesTable nodes={feed.nodes} thisNodeId={thisNodeId} />
      {statusAt && (
        <Text c="text-secondary" size="sm">
          {t`Updated ${getRelativeTime(statusAt)}.`}
        </Text>
      )}
    </Stack>
  );
}

function StreamsTable({ streams }: { streams: MonitorRelayStream[] }) {
  return (
    <Box>
      <SettingHeader
        title={t`Streams`}
        description={t`For each table, the id that ${MONITOR_NAME} has every row up to, and the newest id in the application database.`}
      />
      <Table
        columns={[
          { key: "stream", name: t`Stream` },
          { key: "w", name: t`Received up to` },
          { key: "sequence", name: t`Latest id` },
          { key: "history", name: t`History` },
        ]}
        rows={streams.map((stream) => ({ ...stream, id: stream.stream }))}
        rowRenderer={(stream) => (
          <tr>
            <td>{getStreamLabel(stream.stream)}</td>
            <td>{formatId(stream.w)}</td>
            <td>{formatId(stream.sequence)}</td>
            <td>
              <HistoryProgress stream={stream} />
            </td>
          </tr>
        )}
      />
    </Box>
  );
}

function HistoryProgress({ stream }: { stream: MonitorRelayStream }) {
  if (stream.floor !== null && stream.target === null) {
    return <Text c="text-secondary">{t`No history`}</Text>;
  }
  const progress = getHistoryProgress(stream);
  if (progress === null) {
    return <Text c="text-secondary">{t`Not started`}</Text>;
  }
  const percent = Math.floor(progress * 100);
  return (
    <Group gap="sm" wrap="nowrap">
      <Progress value={percent} w="6rem" aria-label={t`History`} />
      <Text>{t`${percent}%`}</Text>
    </Group>
  );
}

function StateTable({ state }: { state: MonitorRelayStateKind[] }) {
  return (
    <Box>
      <SettingHeader
        title={t`State`}
        description={t`For each kind of state, when ${MONITOR_NAME} read all of it. It reads each kind once. After that, this instance sends only its changes, every few seconds.`}
      />
      <Table
        columns={[
          { key: "kind", name: t`Kind` },
          { key: "snapshot_age_s", name: t`Full read` },
        ]}
        rows={state.map((kind) => ({ ...kind, id: kind.kind }))}
        rowRenderer={(kind) => (
          <tr>
            <td>{getStateKindLabel(kind.kind)}</td>
            <td>{formatAge(kind.snapshot_age_s, t`Not yet`)}</td>
          </tr>
        )}
      />
    </Box>
  );
}

function NodesTable({
  nodes,
  thisNodeId,
}: {
  nodes: MonitorRelayNode[];
  thisNodeId: string;
}) {
  return (
    <Box>
      <SettingHeader
        title={t`Nodes`}
        description={t`The nodes whose calls ${MONITOR_NAME} accepted in the last 10 minutes, newest first. One node at a time runs the job.`}
      />
      <Table
        columns={[
          { key: "node_id", name: t`Node` },
          { key: "last_sync_at", name: t`Last call` },
        ]}
        rows={nodes.map((node) => ({ ...node, id: node.node_id }))}
        rowRenderer={(node) => (
          <tr>
            <td>
              {node.node_id === thisNodeId
                ? t`${node.node_id} (this node)`
                : node.node_id}
            </td>
            <td>{getRelativeTime(node.last_sync_at)}</td>
          </tr>
        )}
        emptyBody={
          <Text>{t`${MONITOR_NAME} accepted no call in the last 10 minutes.`}</Text>
        }
      />
    </Box>
  );
}

function NodeState({
  node,
  base,
}: {
  node: MonitorRelayNodeState;
  base: string | null;
}) {
  return (
    <Box>
      <SettingHeader
        title={t`This node`}
        description={base ? t`Sends to ${base}.` : undefined}
      />
      <Stack>
        <Fact
          label={t`Last result`}
          value={node.last_result?.message ?? t`None yet`}
          negative={
            node.last_result != null && node.last_result.outcome !== "ok"
          }
        />
        <SimpleGrid cols={2}>
          <Fact
            label={t`Last run`}
            value={
              node.last_run_at ? getRelativeTime(node.last_run_at) : t`Never`
            }
            note={
              node.ran_here
                ? undefined
                : t`Another node may run the job, or this node's scheduler is off.`
            }
          />
          <Fact
            label={t`Failures in a row`}
            value={String(node.failures)}
            note={
              node.paused_until
                ? t`Paused. It tries again ${getRelativeTime(node.paused_until)}.`
                : undefined
            }
          />
        </SimpleGrid>
      </Stack>
    </Box>
  );
}

function Fact({
  label,
  value,
  note,
  negative,
}: {
  label: string;
  value: string;
  note?: string;
  negative?: boolean;
}) {
  return (
    <Stack gap="xs">
      <Text c="text-secondary" size="sm">
        {label}
      </Text>
      <Text fw="bold" c={negative ? "feedback-negative" : undefined}>
        {value}
      </Text>
      {note && (
        <Text c="text-secondary" size="sm">
          {note}
        </Text>
      )}
    </Stack>
  );
}

function formatId(id: number | null): string {
  return id === null ? t`Unknown` : formatNumber(id);
}

function formatAge(seconds: number | null, none: string): string {
  return seconds === null ? none : t`${duration(seconds * 1000)} ago`;
}
