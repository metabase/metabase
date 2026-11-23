import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  Box,
  Card,
  Code,
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

import type { DataCheckRun } from "../../types";
import {
  DATA_CHECK_DISPLAY_STATUSES,
  type DataCheckDisplayStatus,
  getDataCheckDisplayStatus,
  getDataCheckStatusPresentation,
  getDataCheckTitle,
} from "../../utils";
import {
  DataCheckResultCard,
  formatDataCheckSummary,
} from "../DataCheckResultCard";
import { DataCheckStatus } from "../DataCheckStatus";

type StatusFilter = DataCheckDisplayStatus | "all";

type DataCheckListProps = {
  runs: readonly DataCheckRun[];
  defaultSelectedId?: string;
};

export function DataCheckList({ runs, defaultSelectedId }: DataCheckListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState(defaultSelectedId);

  const counts = useMemo(() => getStatusCounts(runs), [runs]);
  const visibleRuns = useMemo(
    () =>
      sortByStatus(runs).filter(
        (run) =>
          matchesStatus(run, statusFilter) && matchesSearch(run, searchQuery),
      ),
    [runs, statusFilter, searchQuery],
  );
  const selectedRun = runs.find((run) => run.result.id === selectedId);

  return (
    <Stack gap="md">
      <Group justify="space-between" gap="md">
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          data={getFilterOptions(runs.length, counts)}
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
        <Card withBorder shadow="none" p={0} flex="1 1 0" miw={0}>
          <Box role="list" aria-label={t`Checks`}>
            {visibleRuns.map((run) => (
              <DataCheckListRow
                key={run.result.id}
                run={run}
                isSelected={run.result.id === selectedId}
                onSelect={() => setSelectedId(run.result.id)}
              />
            ))}
            {visibleRuns.length === 0 && (
              <Text c="text-secondary" p="lg" ta="center">
                {t`No checks found`}
              </Text>
            )}
          </Box>
        </Card>
        {selectedRun != null && (
          <Box flex="1 1 0" miw={0} pos="sticky" top="1rem">
            <DataCheckResultCard {...selectedRun} />
          </Box>
        )}
      </Flex>
    </Stack>
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
          <Group gap="sm" wrap="nowrap">
            <Ellipsified fw="bold">
              {getDataCheckTitle(definition, result)}
            </Ellipsified>
            {result.severity === "warn" && (
              <Text c="text-secondary" fz="sm" flex="none">
                {t`warns only`}
              </Text>
            )}
          </Group>
          <Ellipsified c="text-secondary" fz="sm">
            {formatDataCheckSummary(result)}
          </Ellipsified>
        </Stack>
        <Code flex="none">{result.check}</Code>
      </Group>
    </UnstyledButton>
  );
}

type StatusCounts = Record<DataCheckDisplayStatus, number>;

function getStatusCounts(runs: readonly DataCheckRun[]): StatusCounts {
  const counts: StatusCounts = {
    pass: 0,
    fail: 0,
    warn: 0,
    error: 0,
    unsupported: 0,
  };
  for (const run of runs) {
    counts[getDataCheckDisplayStatus(run.result)] += 1;
  }
  return counts;
}

function getFilterOptions(total: number, counts: StatusCounts) {
  const all: { value: StatusFilter; label: string } = {
    value: "all",
    label: ngettext(msgid`${total} check`, `${total} checks`, total),
  };
  const statuses = DATA_CHECK_DISPLAY_STATUSES.filter(
    (status) => counts[status] > 0,
  ).map((status): { value: StatusFilter; label: string } => ({
    value: status,
    label: `${getDataCheckStatusPresentation(status).label} ${counts[status]}`,
  }));
  return [all, ...statuses];
}

function sortByStatus(runs: readonly DataCheckRun[]) {
  const getRank = (run: DataCheckRun) =>
    DATA_CHECK_DISPLAY_STATUSES.indexOf(getDataCheckDisplayStatus(run.result));
  return [...runs].sort((a, b) => getRank(a) - getRank(b));
}

function matchesStatus(run: DataCheckRun, filter: StatusFilter) {
  return filter === "all" || getDataCheckDisplayStatus(run.result) === filter;
}

function matchesSearch(run: DataCheckRun, query: string) {
  const text = [
    getDataCheckTitle(run.definition, run.result),
    run.result.check,
    run.result.message,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(query.trim().toLowerCase());
}
