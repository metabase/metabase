import { useEffect, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import {
  Anchor,
  Badge,
  Box,
  Card,
  Divider,
  Drawer,
  Group,
  Icon,
  Loader,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  type BulkOptimizeDoneEntry,
  type BulkOptimizeStatusResponse,
  useBulkOptimizeStatusQuery,
} from "../../api";
import type { Proposal, ProposalSeverity } from "../../types";

// Poll every 2s while a job is in flight. Once everything is settled the
// query stays mounted (so the drawer keeps showing results) but pollingInterval
// resolves to 0, which RTK Query treats as "stop polling".
const POLL_MS = 2000;

type BulkResultsDrawerProps = {
  opened: boolean;
  onClose: () => void;
};

export function BulkResultsDrawer({ opened, onClose }: BulkResultsDrawerProps) {
  // Polling cadence is driven from a state that we adjust in an effect once
  // the response lands — destructuring `data` and referencing it inside the
  // same hook-options object is a temporal-dead-zone trap.
  const [pollingInterval, setPollingInterval] = useState(0);
  const { data, isLoading } = useBulkOptimizeStatusQuery(undefined, {
    pollingInterval,
    skip: !opened,
  });

  useEffect(() => {
    if (!opened) {
      setPollingInterval(0);
      return;
    }
    const stillRunning = (data?.pending ?? []).length > 0;
    setPollingInterval(stillRunning ? POLL_MS : 0);
  }, [opened, data]);

  const total = data?.total ?? 0;
  const doneEntries = Object.values(data?.done ?? {});
  const failedEntries = Object.entries(data?.failed ?? {});
  const settled = doneEntries.length + failedEntries.length;
  const pending = (data?.pending ?? []).length;
  const isRunning = pending > 0;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={
        <Group gap="sm">
          <Icon name="bolt" />
          <Text fw="bold">{t`Bulk optimization`}</Text>
        </Group>
      }
    >
      {isLoading && !data ? (
        <Group p="md" justify="center">
          <Loader size="sm" />
        </Group>
      ) : total === 0 ? (
        <Box p="md">
          <Text c="text-secondary">
            {t`No bulk-optimize run has been kicked off yet.`}
          </Text>
        </Box>
      ) : (
        <Stack gap="md">
          <BulkProgressHeader
            data={data!}
            settled={settled}
            isRunning={isRunning}
          />
          <Divider />
          <ScrollArea h="calc(100vh - 200px)" type="auto" offsetScrollbars>
            <Stack p="md" gap="md">
              {doneEntries.length === 0 && !isRunning ? (
                <Text c="text-secondary">{t`No transforms completed yet.`}</Text>
              ) : (
                doneEntries.map((entry) => (
                  <TransformResultCard
                    key={entry.transform.id}
                    entry={entry}
                  />
                ))
              )}
              {failedEntries.map(([id, message]) => (
                <FailureCard
                  key={id}
                  transformId={Number(id)}
                  message={message}
                />
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      )}
    </Drawer>
  );
}

function BulkProgressHeader({
  data,
  settled,
  isRunning,
}: {
  data: BulkOptimizeStatusResponse;
  settled: number;
  isRunning: boolean;
}) {
  const total = data.total;
  const value = total > 0 ? (settled / total) * 100 : 0;
  const failedCount = Object.keys(data.failed).length;

  return (
    <Stack px="md" pt="md" gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Text fw="bold">
          {isRunning
            ? c("Bulk-optimize progress, X of Y").t`Analyzing ${settled} / ${total}`
            : c("Bulk-optimize complete, X of Y").t`Done — ${settled} / ${total}`}
        </Text>
        {isRunning && <Loader size="xs" />}
      </Group>
      <Progress value={value} animated={isRunning} />
      {failedCount > 0 && (
        <Text c="error" fz="sm">
          {c("Failed count in bulk-optimize header")
            .t`${failedCount} failed — see below.`}
        </Text>
      )}
    </Stack>
  );
}

const SEVERITY_COLOR: Record<ProposalSeverity, string> = {
  high: "error",
  medium: "warning",
  low: "text-secondary",
};

function TransformResultCard({ entry }: { entry: BulkOptimizeDoneEntry }) {
  const { transform, summary, proposals, optimization_degree } = entry;
  const isOptimized = optimization_degree === 100;

  return (
    <Card withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2} miw={0} style={{ flex: 1 }}>
            <Anchor
              component={Link}
              to={Urls.transformRun(transform.id)}
              fw="bold"
            >
              {transform.name}
            </Anchor>
            {summary && (
              <Text c="text-secondary" fz="sm">
                {summary}
              </Text>
            )}
          </Stack>
          <Badge
            color={isOptimized ? "success" : "brand"}
            variant={isOptimized ? "light" : "filled"}
          >
            {isOptimized
              ? t`Fully optimized`
              : c("Proposal count badge in bulk results")
                  .t`${proposals.length} suggestion(s)`}
          </Badge>
        </Group>
        {proposals.length > 0 && (
          <>
            <Divider />
            <Stack gap="xs">
              {proposals.map((p) => (
                <ProposalRow key={p.id} proposal={p} />
              ))}
            </Stack>
            <Group justify="flex-end">
              <Anchor component={Link} to={Urls.transformRun(transform.id)} fz="sm">
                {t`Open transform to verify / accept →`}
              </Anchor>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
  const severityColor = SEVERITY_COLOR[proposal.severity];
  return (
    <Stack gap={2}>
      <Group gap="xs" wrap="nowrap">
        <Badge color={severityColor} variant="light" size="sm">
          {proposal.severity}
        </Badge>
        <Badge variant="default" size="sm">
          {proposal.kind}
        </Badge>
        <Text fw="bold" fz="sm">
          {proposal.name}
        </Text>
        <Text c="text-secondary" fz="xs">
          ({proposal.expected_speedup})
        </Text>
      </Group>
      <Text c="text-secondary" fz="sm">
        {proposal.rationale}
      </Text>
    </Stack>
  );
}

function FailureCard({
  transformId,
  message,
}: {
  transformId: number;
  message: string;
}) {
  return (
    <Card withBorder p="md" radius="md" bg="bg-error">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Icon name="warning" c="error" />
        <Stack gap={2} miw={0} style={{ flex: 1 }}>
          <Anchor component={Link} to={Urls.transformRun(transformId)} fw="bold">
            {c("Failed transform link in bulk results, {0} is the transform id")
              .t`Transform #${transformId}`}
          </Anchor>
          <Text c="error" fz="sm">
            {message}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}
