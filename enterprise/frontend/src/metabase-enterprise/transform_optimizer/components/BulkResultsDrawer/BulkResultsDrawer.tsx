import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useListTransformsQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Divider,
  Group,
  Icon,
  Loader,
  Modal,
  Progress,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  type BulkOptimizeDoneEntry,
  type BulkOptimizeStatusResponse,
  optimizerApi,
  useBulkOptimizeStatusQuery,
} from "../../api";

import { BulkTransformCard } from "./BulkTransformCard";

type RowStatus = "running" | "queued" | "done" | "failed";

type Row =
  | { id: number; name: string; status: "running" }
  | { id: number; name: string; status: "queued" }
  | { id: number; name: string; status: "done"; entry: BulkOptimizeDoneEntry }
  | { id: number; name: string; status: "failed"; message: string };

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
  const doneEntries = useMemo(
    () => Object.values(data?.done ?? {}),
    [data?.done],
  );
  const failedEntries = useMemo(
    () => Object.entries(data?.failed ?? {}),
    [data?.failed],
  );
  const pendingIds = data?.pending ?? [];
  const settled = doneEntries.length + failedEntries.length;
  const isRunning = pendingIds.length > 0;

  // The transforms list is almost always cached by the parent
  // TransformListPage, so this is a no-network lookup in practice. We use
  // it to render each pending row by name rather than by bare id.
  const { data: transforms } = useListTransformsQuery({});
  const transformNameById = useMemo(() => {
    const out = new Map<number, string>();
    for (const t of transforms ?? []) {
      out.set(t.id, t.name);
    }
    return out;
  }, [transforms]);

  // Cross-card dedup for identical index proposals. The optimizer often
  // emits the same `CREATE INDEX IF NOT EXISTS idx_events_customer_id …`
  // across multiple transforms that reference the same hot table; once any
  // one is accepted, the rest are no-ops. We key on `ddl_statement.index_name`
  // which the BE assigns at validation time, so the comparison is stable
  // across both `source-db` and `transform-target` targets.
  const [acceptedIndexNames, setAcceptedIndexNames] = useState<Set<string>>(
    () => new Set(),
  );
  const handleIndexAccepted = useCallback((indexName: string) => {
    setAcceptedIndexNames((prev) => {
      if (prev.has(indexName)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(indexName);
      return next;
    });
  }, []);
  // Reset the dedup set when a fresh bulk run starts so previously accepted
  // indexes don't pre-suppress the next batch.
  useEffect(() => {
    setAcceptedIndexNames(new Set());
  }, [data?.started_at]);

  // Stable ordering for the accordion. The BE status response gives us
  // `pending` in submission order and `done`/`failed` as unordered maps
  // keyed by insertion-order — which is *completion* order, not submission
  // order, so a slower transform would visually jump past a faster one as
  // it finishes. We freeze each id's position at first sight and never
  // re-shuffle. Reset on `started_at` so a new batch starts clean.
  const orderRef = useRef<number[]>([]);
  useEffect(() => {
    orderRef.current = [];
  }, [data?.started_at]);
  const rows = useMemo<Row[]>(() => {
    const doneById = new Map(doneEntries.map((e) => [e.transform.id, e]));
    const failedByIdStr = new Map(failedEntries);
    const seen = new Set(orderRef.current);
    // Collect any ids we haven't seen yet across all three buckets, then
    // sort them by id ascending so the initial seed (which may happen
    // mid-run, with some items already complete) lands in a deterministic
    // order roughly matching submission. After that, ids only get appended
    // here in the rare case a new one shows up mid-batch.
    const incoming: number[] = [];
    for (const id of pendingIds) {
      if (!seen.has(id)) {
        incoming.push(id);
        seen.add(id);
      }
    }
    for (const entry of doneEntries) {
      if (!seen.has(entry.transform.id)) {
        incoming.push(entry.transform.id);
        seen.add(entry.transform.id);
      }
    }
    for (const [idStr] of failedEntries) {
      const id = Number(idStr);
      if (!seen.has(id)) {
        incoming.push(id);
        seen.add(id);
      }
    }
    incoming.sort((a, b) => a - b);
    orderRef.current = [...orderRef.current, ...incoming];
    // Drop ids that no longer appear anywhere — defensive against a fresh
    // batch arriving without `started_at` changing (shouldn't happen, but
    // cheap to handle).
    const present = new Set<number>([
      ...pendingIds,
      ...doneEntries.map((e) => e.transform.id),
      ...failedEntries.map(([id]) => Number(id)),
    ]);
    orderRef.current = orderRef.current.filter((id) => present.has(id));

    return orderRef.current.map((id): Row => {
      const name = transformNameById.get(id) ?? t`Transform #${id}`;
      const done = doneById.get(id);
      if (done) {
        return { id, name, status: "done", entry: done };
      }
      const failed = failedByIdStr.get(String(id));
      if (failed != null) {
        return { id, name, status: "failed", message: failed };
      }
      // The BE processes the queue sequentially, so the first pending id
      // is the one actively analyzing right now.
      const pendingIdx = pendingIds.indexOf(id);
      return {
        id,
        name,
        status: pendingIdx === 0 ? "running" : "queued",
      };
    });
  }, [pendingIds, doneEntries, failedEntries, transformNameById]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      // The drawer used to be a side panel — wide enough for proposal
      // cards but cramped for the SQL diffs. Centered modal at 80vw / 90vh
      // gives breathing room for several proposals side by side.
      size="80%"
      // Outer chrome padding — Mantine applies this to the modal body
      // including the title row, so the bolt icon / heading sit inside
      // the same gutter as the content below. Inner sections then only
      // need vertical spacing between siblings.
      padding="xl"
      title={
        <Group gap="sm">
          <Icon name="bolt" />
          <Text fw="bold">{t`Bulk optimization`}</Text>
        </Group>
      }
    >
      {isLoading && !data ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : total === 0 ? (
        <Box>
          <Text c="text-secondary">
            {t`No bulk-optimize run has been kicked off yet.`}
          </Text>
        </Box>
      ) : (
        <Stack gap="lg">
          <BulkProgressHeader
            data={data!}
            settled={settled}
            isRunning={isRunning}
            currentName={
              isRunning
                ? transformNameById.get(pendingIds[0]) ??
                  t`Transform #${pendingIds[0]}`
                : null
            }
          />
          <Divider />
          <ScrollArea h="calc(90vh - 200px)" type="auto" offsetScrollbars>
            <Box pr="md">
              {rows.length === 0 ? (
                <Text c="text-secondary">{t`No transforms in this batch yet.`}</Text>
              ) : (
                <Accordion
                  multiple
                  // Queued items have no body content yet, so chevrons on
                  // those rows are hidden — keep the header informative
                  // but not interactive.
                  chevronPosition="right"
                  variant="separated"
                  radius="md"
                  // Closed by default: the user opens the file they want to
                  // act on. Empty initial value with `multiple` lets them
                  // open several at once for comparison.
                  defaultValue={[]}
                >
                  {rows.map((row) => (
                    <BulkResultRow
                      key={row.id}
                      row={row}
                      acceptedIndexNames={acceptedIndexNames}
                      onIndexAccepted={handleIndexAccepted}
                    />
                  ))}
                </Accordion>
              )}
            </Box>
          </ScrollArea>
        </Stack>
      )}
    </Modal>
  );
}

function BulkProgressHeader({
  data,
  settled,
  isRunning,
  currentName,
}: {
  data: BulkOptimizeStatusResponse;
  settled: number;
  isRunning: boolean;
  currentName: string | null;
}) {
  const total = data.total;
  const value = total > 0 ? (settled / total) * 100 : 0;
  const failedCount = Object.keys(data.failed).length;

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} miw={0}>
          <Text fw="bold">
            {isRunning
              ? c("Bulk-optimize progress, X of Y")
                  .t`Analyzing ${settled} / ${total}`
              : c("Bulk-optimize complete, X of Y")
                  .t`Done — ${settled} / ${total}`}
          </Text>
          {isRunning && currentName && (
            <Text c="text-secondary" fz="sm">
              {c("Bulk-optimize header subline naming the transform in flight")
                .t`Currently analyzing: ${currentName}`}
            </Text>
          )}
        </Stack>
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

/**
 * One accordion item per transform in the bulk batch. Header carries the
 * status (icon / loader + label + suggestion count badge) and stays
 * informative when collapsed; the panel shows the result body — proposals
 * for `done`, an error message for `failed`, and a placeholder for the
 * still-in-flight states. Queued rows have no body and are non-interactive.
 */
function BulkResultRow({
  row,
  acceptedIndexNames,
  onIndexAccepted,
}: {
  row: Row;
  acceptedIndexNames: Set<string>;
  onIndexAccepted: (indexName: string) => void;
}) {
  const expandable = row.status === "done" || row.status === "failed";
  return (
    <Accordion.Item value={String(row.id)}>
      <Accordion.Control
        // Disable the chevron + click handling for rows with no body. The
        // header text still conveys "Queued" / "Analyzing…", which is what
        // matters at this stage.
        disabled={!expandable}
        chevron={expandable ? undefined : <Box w={0} />}
      >
        <RowHeader row={row} />
      </Accordion.Control>
      {expandable && (
        <Accordion.Panel>
          {row.status === "done" ? (
            <BulkTransformCard
              entry={row.entry}
              acceptedIndexNames={acceptedIndexNames}
              onIndexAccepted={onIndexAccepted}
            />
          ) : (
            <FailureBody transformId={row.id} message={row.message} />
          )}
        </Accordion.Panel>
      )}
    </Accordion.Item>
  );
}

/**
 * True when this batch entry has at least one high-severity rewrite or
 * precompute proposal. Index proposals are valuable but the user's bar
 * for "strong rewrite candidate" is specifically about *structural* SQL
 * changes the LLM is confident about — those are the ones worth a human
 * review pass first. We don't include medium/low because the LLM already
 * downgrades cosmetic-or-borderline rewrites per the prelude.
 */
function isStrongRewriteCandidate(row: Row): boolean {
  if (row.status !== "done") {
    return false;
  }
  return row.entry.proposals.some(
    (p) =>
      (p.kind === "rewrite" || p.kind === "precompute") &&
      p.severity === "high",
  );
}

function RowHeader({ row }: { row: Row }) {
  const isStrong = isStrongRewriteCandidate(row);
  return (
    <Group gap="sm" wrap="nowrap" align="center" w="100%">
      <StatusIndicator status={row.status} />
      <Text fw="bold" miw={0} truncate style={{ flex: 1 }}>
        {row.name}
      </Text>
      {isStrong && (
        <Tooltip
          label={t`The optimizer is confident this transform has a high-impact rewrite or precompute available.`}
          multiline
          w={260}
        >
          <Badge
            color="brand"
            variant="filled"
            leftSection={<Icon name="star" size={10} />}
          >
            {t`Top rewrite candidate`}
          </Badge>
        </Tooltip>
      )}
      <RowStatusMeta row={row} />
    </Group>
  );
}

function StatusIndicator({ status }: { status: RowStatus }) {
  switch (status) {
    case "running":
      return <Loader size="xs" />;
    case "queued":
      return <Icon name="clock" c="text-secondary" />;
    case "done":
      return <Icon name="check_filled" c="success" />;
    case "failed":
      return <Icon name="warning" c="error" />;
  }
}

function RowStatusMeta({ row }: { row: Row }) {
  switch (row.status) {
    case "running":
      return (
        <Text c="text-secondary" fz="sm">
          {t`Analyzing…`}
        </Text>
      );
    case "queued":
      return (
        <Text c="text-secondary" fz="sm">
          {t`Queued`}
        </Text>
      );
    case "failed":
      return (
        <Badge color="error" variant="light">
          {t`Failed`}
        </Badge>
      );
    case "done": {
      const count = row.entry.proposals.length;
      const isOptimized = row.entry.optimization_degree === 100;
      if (isOptimized || count === 0) {
        return (
          <Badge color="success" variant="light">
            {t`Fully optimized`}
          </Badge>
        );
      }
      // Use the warning palette and a bigger size so the "this transform
      // has suggestions to review" chip jumps out of the row at a glance
      // — brand-filled was visually similar to the row chrome and got lost.
      return (
        <Badge color="warning" variant="filled" size="lg">
          {c("Proposal count badge in bulk results")
            .t`${count} suggestion(s)`}
        </Badge>
      );
    }
  }
}

function FailureBody({
  transformId,
  message,
}: {
  transformId: number;
  message: string;
}) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" p="md">
      <Icon name="warning" c="error" />
      <Stack gap={2} miw={0} style={{ flex: 1 }}>
        <Anchor component={Link} to={Urls.transformRun(transformId)} fw="bold">
          {c("Failed transform link in bulk results, {0} is the transform id")
            .t`Open transform #${transformId}`}
        </Anchor>
        <Text c="error" fz="sm">
          {message}
        </Text>
      </Stack>
    </Group>
  );
}
