import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Card,
  Ellipsified,
  Flex,
  Group,
  Icon,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";

import { describeDataCheck } from "../../describe";
import type { DataCheckRun } from "../../types";
import {
  type DataCheckDisplayStatus,
  formatDataCheckStatusCount,
  formatDataCheckTotal,
  getDataCheckDisplayStatus,
  getDataCheckProblem,
} from "../../utils";
import { DataCheckResultCard } from "../DataCheckResultCard";
import { DataCheckStatus } from "../DataCheckStatus";

type RanStatus = Exclude<DataCheckDisplayStatus, "unsupported">;

type StatusFilter = RanStatus | "all";

const RAN_STATUSES: readonly RanStatus[] = ["fail", "warn", "error", "pass"];

type DataCheckListProps = {
  runs: readonly DataCheckRun[];
  defaultSelectedId?: string;
};

export function DataCheckList({ runs, defaultSelectedId }: DataCheckListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState(defaultSelectedId);

  const { ranRuns, waitingRuns, counts } = useMemo(
    () => groupRuns(runs),
    [runs],
  );
  const visibleRuns = ranRuns.filter(
    (run) =>
      (statusFilter === "all" ||
        getDataCheckDisplayStatus(run.result) === statusFilter) &&
      matchesSearch(run, searchQuery),
  );
  const visibleWaitingRuns =
    statusFilter === "all"
      ? waitingRuns.filter((run) => matchesSearch(run, searchQuery))
      : [];
  const selectedRun = runs.find((run) => run.result.id === selectedId);
  const renderRow = (run: DataCheckRun) => (
    <DataCheckListRow
      key={run.result.id}
      run={run}
      isSelected={run.result.id === selectedId}
      onSelect={() => setSelectedId(run.result.id)}
    />
  );

  return (
    <Stack gap="lg">
      <DataCheckSummary
        counts={counts}
        total={ranRuns.length}
        waiting={waitingRuns.length}
      />
      <Group justify="space-between" gap="md">
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          data={getFilterOptions(ranRuns.length, counts)}
        />
        <TextInput
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          w="16rem"
        />
      </Group>
      <Flex gap="lg" align="start">
        <Stack gap="lg" flex="1 1 0" miw={0}>
          <Card withBorder shadow="none" p={0}>
            <Box role="list" aria-label={t`Checks`}>
              {visibleRuns.map(renderRow)}
              {visibleRuns.length === 0 && (
                <Text c="text-secondary" p="lg" ta="center">
                  {t`No checks found`}
                </Text>
              )}
            </Box>
          </Card>
          {visibleWaitingRuns.length > 0 && (
            <Stack gap="sm">
              <Stack gap="xs">
                <Text fw="bold">
                  {formatDataCheckStatusCount(
                    "unsupported",
                    visibleWaitingRuns.length,
                  )}
                </Text>
                <Text c="text-secondary">
                  {t`These checks need something that isn't available yet, such as earlier runs to compare with. They aren't counted above.`}
                </Text>
              </Stack>
              <Card withBorder shadow="none" p={0}>
                <Box role="list" aria-label={t`Checks that can't run yet`}>
                  {visibleWaitingRuns.map(renderRow)}
                </Box>
              </Card>
            </Stack>
          )}
        </Stack>
        {selectedRun != null && (
          <Box flex="1 1 0" miw={0} pos="sticky" top="1rem">
            <DataCheckResultCard {...selectedRun} />
          </Box>
        )}
      </Flex>
    </Stack>
  );
}

type RanCounts = Record<RanStatus, number>;

type DataCheckSummaryProps = {
  counts: RanCounts;
  total: number;
  waiting: number;
};

function DataCheckSummary({ counts, total, waiting }: DataCheckSummaryProps) {
  const notPassed = total - counts.pass;
  const details = RAN_STATUSES.filter(
    (status) => status !== "pass" && counts[status] > 0,
  ).map((status) => formatDataCheckStatusCount(status, counts[status]));
  if (waiting > 0) {
    details.push(formatDataCheckStatusCount("unsupported", waiting));
  }

  return (
    <Group gap="sm">
      <DataCheckStatus
        status={counts.fail > 0 ? "fail" : notPassed > 0 ? "warn" : "pass"}
        withLabel={false}
      />
      <Text fw="bold">
        {t`${counts.pass} of ${formatDataCheckTotal(total)} passed`}
      </Text>
      {details.length > 0 && (
        <Text c="text-secondary">{details.join(" · ")}</Text>
      )}
    </Group>
  );
}

type DataCheckListRowProps = {
  run: DataCheckRun;
  isSelected: boolean;
  onSelect: () => void;
};

function DataCheckListRow({
  run,
  isSelected,
  onSelect,
}: DataCheckListRowProps) {
  const { definition, result } = run;
  const status = getDataCheckDisplayStatus(result);
  const didNotRun = status === "error" || status === "unsupported";

  return (
    <UnstyledButton
      role="listitem"
      display="block"
      w="100%"
      px="md"
      py="sm"
      bg={isSelected ? "background_surface-brand-subtle" : undefined}
      style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
      aria-current={isSelected ? "true" : undefined}
      onClick={onSelect}
    >
      <Group wrap="nowrap" gap="md" align="start">
        <Box pt={2}>
          <DataCheckStatus status={status} withLabel={false} />
        </Box>
        <Stack gap={2} flex="1 1 0" miw={0}>
          <Ellipsified fw="bold">
            {definition.name ?? describeDataCheck(definition)}
          </Ellipsified>
          <Ellipsified c="text-secondary" fz="sm">
            {didNotRun
              ? getDataCheckProblem(result, status === "unsupported").title
              : result.message}
          </Ellipsified>
        </Stack>
      </Group>
    </UnstyledButton>
  );
}

function groupRuns(runs: readonly DataCheckRun[]) {
  const counts: RanCounts = { fail: 0, warn: 0, error: 0, pass: 0 };
  const ranRuns: DataCheckRun[] = [];
  const waitingRuns: DataCheckRun[] = [];
  for (const run of runs) {
    const status = getDataCheckDisplayStatus(run.result);
    if (status === "unsupported") {
      waitingRuns.push(run);
    } else {
      counts[status] += 1;
      ranRuns.push(run);
    }
  }
  const getRank = (run: DataCheckRun) =>
    RAN_STATUSES.findIndex(
      (status) => status === getDataCheckDisplayStatus(run.result),
    );
  ranRuns.sort((a, b) => getRank(a) - getRank(b));
  return { ranRuns, waitingRuns, counts };
}

function getFilterOptions(total: number, counts: RanCounts) {
  const all: { value: StatusFilter; label: string } = {
    value: "all",
    label: formatDataCheckTotal(total),
  };
  const statuses = RAN_STATUSES.filter((status) => counts[status] > 0).map(
    (status): { value: StatusFilter; label: string } => ({
      value: status,
      label: formatDataCheckStatusCount(status, counts[status]),
    }),
  );
  return [all, ...statuses];
}

function matchesSearch(run: DataCheckRun, query: string) {
  const text = [
    run.definition.name ?? describeDataCheck(run.definition),
    run.result.check,
    run.result.message,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(query.trim().toLowerCase());
}
