import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useDispatch } from "metabase/redux";
import {
  Anchor,
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
  optimizerApi,
  useBulkOptimizeStatusQuery,
} from "../../api";

import { BulkTransformCard } from "./BulkTransformCard";

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
  const dispatch = useDispatch();

  useEffect(() => {
    if (!opened) {
      setPollingInterval(0);
      return;
    }
    const stillRunning = (data?.pending ?? []).length > 0;
    setPollingInterval(stillRunning ? POLL_MS : 0);
  }, [opened, data]);

  // The detail page's TransformOptimizerSection reads from the optimize
  // endpoint's RTK Query cache. The bulk run populated the BE proposal
  // cache (so verify / accept work) but didn't touch the FE cache —
  // navigating to ANY of the bulk-analysed transforms would otherwise
  // land on the trigger button and force a re-analysis. Seed every
  // completed entry into the FE cache as soon as it lands, regardless
  // of whether the user later clicks through the drawer or arrives at
  // the transform via some other route (list page, deep link).
  const seedOptimizeCache = useCallback(
    (entry: BulkOptimizeDoneEntry) => {
      dispatch(
        optimizerApi.util.upsertQueryData(
          "optimize",
          { transformId: entry.transform.id, analyze: false },
          {
            transform: {
              id: entry.transform.id,
              name: entry.transform.name,
              source_database_id: entry.transform.source_database_id,
            },
            // The bulk endpoint doesn't return the compiled SQL — the
            // section doesn't read from this field, only the proposals
            // array, so null is safe.
            sql: null,
            summary: entry.summary,
            proposals: entry.proposals,
            optimization_degree: entry.optimization_degree,
          },
        ),
      );
    },
    [dispatch],
  );

  // Seed every entry that's appeared in `data.done` since the last poll.
  // Tracked through a ref so re-renders triggered by polling don't keep
  // dispatching identical upserts (RTK would no-op them, but it's wasted
  // work and clutters DevTools).
  const seededIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!data?.done) {
      return;
    }
    for (const entry of Object.values(data.done)) {
      if (!seededIdsRef.current.has(entry.transform.id)) {
        seededIdsRef.current.add(entry.transform.id);
        seedOptimizeCache(entry);
      }
    }
  }, [data?.done, seedOptimizeCache]);

  // Reset the dedup set when a fresh bulk run kicks off — `started_at`
  // changes per POST /bulk-optimize and is the cleanest "this is a new
  // batch" signal we have without threading a job id everywhere.
  useEffect(() => {
    seededIdsRef.current = new Set();
  }, [data?.started_at]);

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
                  <BulkTransformCard
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
