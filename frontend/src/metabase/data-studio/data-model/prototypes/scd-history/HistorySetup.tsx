import type { ReactNode } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  DetailPanel,
  DetailPanelHeader,
} from "metabase/data-studio/data-model/pages/DataModel/DetailPanel";
import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Flex,
  Group,
  Icon,
  NavLink,
  Paper,
  Progress,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
} from "metabase/ui";

import { type ResultColumn, ResultGrid } from "./ResultGrid";
import {
  CUSTOMERS_SNAPSHOT,
  type SnapshotRow,
  TODAY,
  isValidOn,
} from "./sample-data";

const SNAPSHOT_FIELDS = [
  "customer_id",
  "name",
  "plan",
  "region",
  "dbt_scd_id",
  "dbt_updated_at",
  "dbt_valid_from",
  "dbt_valid_to",
];

const noop = () => undefined;

const rowsByCustomer = CUSTOMERS_SNAPSHOT.reduce<Record<string, SnapshotRow[]>>(
  (groups, row) => ({
    ...groups,
    [row.customer_id]: [...(groups[row.customer_id] ?? []), row],
  }),
  {},
);
const CUSTOMER_COUNT = Object.keys(rowsByCustomer).length;

const sortedVersions = (rows: SnapshotRow[]) =>
  [...rows].sort((a, b) => a.dbt_valid_from.localeCompare(b.dbt_valid_from));

const customersWithManyCurrentRows = Object.entries(rowsByCustomer).filter(
  ([, rows]) => rows.filter((row) => row.dbt_valid_to === null).length > 1,
);

const overlappingVersions = Object.values(rowsByCustomer).flatMap((rows) => {
  const sorted = sortedVersions(rows);
  return sorted
    .slice(1)
    .map((next, index) => ({ previous: sorted[index], next }))
    .filter(
      ({ previous, next }) =>
        previous.dbt_valid_to !== null &&
        previous.dbt_valid_to > next.dbt_valid_from,
    );
});

const countChangedCustomers = (attribute: "plan" | "region" | "name") =>
  Object.values(rowsByCustomer).filter(
    (rows) => new Set(rows.map((row) => row[attribute])).size > 1,
  ).length;

function FieldSelect({
  value,
  isNew = false,
}: {
  value: string;
  isNew?: boolean;
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Select
        flex={1}
        data={SNAPSHOT_FIELDS}
        value={value}
        leftSection={<Icon name="label" />}
        aria-label={value}
      />
      {isNew && <NewBadge />}
    </Group>
  );
}

const getCurrentRowRuleOptions = (): { value: string; label: string }[] => [
  { value: "flag", label: t`Flag column is true` },
  { value: "empty-valid-to", label: t`Valid to is empty` },
  { value: "sentinel", label: t`Valid to is 9999-12-31` },
];

function NewBadge() {
  return (
    <Badge color="brand" variant="light">
      {t`New`}
    </Badge>
  );
}

function DataStudioTablePicker() {
  return (
    <Stack flex={1} miw={260} p="md" gap={2} bg="background_page-primary">
      <NavLink
        label={t`Warehouse`}
        leftSection={<Icon name="database" />}
        opened
        childrenOffset="md"
      >
        <NavLink
          label={t`analytics`}
          leftSection={<Icon name="folder" />}
          opened
          childrenOffset="md"
        >
          <NavLink
            label={t`Dim Customer`}
            leftSection={<Icon name="table2" />}
          />
          <NavLink label={t`Fct Orders`} leftSection={<Icon name="table2" />} />
        </NavLink>
        <NavLink
          label={t`snapshots`}
          leftSection={<Icon name="folder" />}
          opened
          childrenOffset="md"
        >
          <NavLink
            active
            label={t`Customers Snapshot`}
            leftSection={<Icon name="table2" />}
            rightSection={<Icon name="history" c="text-brand" />}
          />
          <NavLink
            label={t`Plans Snapshot`}
            leftSection={<Icon name="table2" />}
          />
        </NavLink>
      </NavLink>
    </Stack>
  );
}

function TableTabs({ children }: { children: ReactNode }) {
  return (
    <Tabs value="details">
      <Tabs.List mb="xl">
        <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
        <Tabs.Tab value="field">{t`Fields`}</Tabs.Tab>
        <Tabs.Tab value="segments">{t`Segments`}</Tabs.Tab>
        <Tabs.Tab value="measures">{t`Measures`}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="details">
        <Stack gap="xxl">{children}</Stack>
      </Tabs.Panel>
    </Tabs>
  );
}

function SnapshotDetectedAlert() {
  return (
    <Alert
      color="core-brand"
      variant="light"
      icon={<Icon name="history" />}
      title={t`This looks like a dbt snapshot of customers`}
    >
      <Stack gap="sm">
        <Text size="sm">
          {t`Found dbt_scd_id, dbt_updated_at, dbt_valid_from and dbt_valid_to. Sync found no primary key, so the durable key comes from the snapshot’s unique key: customer_id.`}
        </Text>
        <Group gap="sm">
          <Button
            variant="filled"
            size="compact-sm"
          >{t`Treat as history`}</Button>
          <Button size="compact-sm">{t`Not a history table`}</Button>
        </Group>
      </Stack>
    </Alert>
  );
}

function ColumnChangeRow({
  attribute,
}: {
  attribute: "plan" | "region" | "name";
}) {
  const changed = countChangedCustomers(attribute);
  return (
    <DetailsRow
      label={attribute}
      value={
        <Group gap="md" wrap="nowrap">
          <Progress value={(changed / CUSTOMER_COUNT) * 100} w={96} />
          <Text size="sm" c={changed === 0 ? "text-secondary" : "text-primary"}>
            {changed === 0
              ? t`Never changed: use the current value everywhere`
              : t`Changed for ${changed} of ${CUSTOMER_COUNT} customers`}
          </Text>
        </Group>
      }
    />
  );
}

export function HistorySetupDrawer() {
  return (
    <Flex h="100%" bg="background_page-secondary">
      <DataStudioTablePicker />
      <DetailPanel defaultWidth={620}>
        <DetailPanelHeader
          icon="table2"
          label={t`Table`}
          title={t`Customers Snapshot`}
          onClose={noop}
        />
        <TableTabs>
          <SnapshotDetectedAlert />
          <SidebarSection title={t`Structure`}>
            <DetailsTable>
              <DetailsRow
                label={t`Role`}
                value={
                  <Select
                    data={[t`History`]}
                    value={t`History`}
                    aria-label={t`Role`}
                  />
                }
              />
              <DetailsRow
                label={t`Each row is`}
                value={t`One version of a customer`}
              />
              <DetailsRow
                label={t`Grain`}
                value={t`customer_id, dbt_valid_from`}
              />
              <DetailsRow label={t`Row identity`} value={t`dbt_scd_id`} />
            </DetailsTable>
          </SidebarSection>
          <SidebarSection title={t`History`}>
            <DetailsTable>
              <DetailsRow
                label={t`Durable key`}
                value={<FieldSelect value="customer_id" />}
              />
              <DetailsRow
                label={t`Version key`}
                value={<FieldSelect value="dbt_scd_id" isNew />}
              />
              <DetailsRow
                label={t`Valid from`}
                value={<FieldSelect value="dbt_valid_from" />}
              />
              <DetailsRow
                label={t`Valid to`}
                value={<FieldSelect value="dbt_valid_to" />}
              />
              <DetailsRow
                label={t`Current row is`}
                value={
                  <Group gap="sm" wrap="nowrap">
                    <Select
                      flex={1}
                      aria-label={t`Current row is`}
                      value="empty-valid-to"
                      data={getCurrentRowRuleOptions()}
                    />
                    <NewBadge />
                  </Group>
                }
              />
              <DetailsRow
                label={t`Default rows`}
                value={
                  <Switch
                    py="xs"
                    label={t`Show only the current version`}
                    checked
                    onChange={noop}
                  />
                }
              />
            </DetailsTable>
          </SidebarSection>
          <SidebarSection
            title={t`Columns over time`}
            titleAside={<NewBadge />}
          >
            <DetailsTable>
              <ColumnChangeRow attribute="plan" />
              <ColumnChangeRow attribute="region" />
              <ColumnChangeRow attribute="name" />
            </DetailsTable>
          </SidebarSection>
        </TableTabs>
      </DetailPanel>
    </Flex>
  );
}

type CheckResult = {
  title: string;
  isPassing: boolean;
  detail?: string;
};

const getChecks = (): CheckResult[] => [
  {
    title: t`One current row per customer`,
    isPassing: customersWithManyCurrentRows.length === 0,
    detail: customersWithManyCurrentRows
      .map(
        ([customerId, rows]) =>
          t`${customerId} has ${rows.filter((row) => row.dbt_valid_to === null).length} current rows`,
      )
      .join(", "),
  },
  {
    title: t`Versions don’t overlap`,
    isPassing: overlappingVersions.length === 0,
    detail: overlappingVersions
      .map(
        ({ previous, next }) =>
          t`${previous.customer_id}: ${previous.plan} ends ${previous.dbt_valid_to}, ${next.plan} starts ${next.dbt_valid_from}`,
      )
      .join(", "),
  },
  { title: t`No gaps between versions`, isPassing: true },
  { title: t`Valid to is after valid from`, isPassing: true },
  { title: t`Durable key is never empty`, isPassing: true },
];

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <DetailsRow
      label={check.title}
      value={
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap" miw={0}>
            <Icon
              name={check.isPassing ? "check_filled" : "warning_round_filled"}
              c={check.isPassing ? "feedback-positive" : "feedback-negative"}
            />
            <Text
              size="sm"
              c={check.isPassing ? "text-secondary" : "text-primary"}
            >
              {check.isPassing ? t`Passed` : check.detail}
            </Text>
          </Group>
          {!check.isPassing && (
            <Button size="compact-sm">{t`View rows`}</Button>
          )}
        </Group>
      }
    />
  );
}

const SNAPSHOT_COLUMNS: ResultColumn<SnapshotRow>[] = [
  { id: "customer_id", name: "customer_id", value: (row) => row.customer_id },
  { id: "plan", name: "plan", value: (row) => row.plan },
  { id: "dbt_scd_id", name: "dbt_scd_id", value: (row) => row.dbt_scd_id },
  {
    id: "dbt_valid_from",
    name: "dbt_valid_from",
    value: (row) => row.dbt_valid_from,
  },
  {
    id: "dbt_valid_to",
    name: "dbt_valid_to",
    value: (row) => row.dbt_valid_to,
  },
];

const [firstDuplicate] = customersWithManyCurrentRows;

const AGENT_CONTEXT = JSON.stringify(
  {
    structure: {
      role: "history",
      one_row_is: "one version of a customer",
      durable_key: "customer_id",
      validity: ["dbt_valid_from", "dbt_valid_to"],
      current_rows: "dbt_valid_to IS NULL",
      tracked_columns: ["plan", "region"],
      rules: [
        "Count customers with COUNT(DISTINCT customer_id), never COUNT(*).",
        "Filter to current rows unless the question names a past date.",
        "For a past date d: dbt_valid_from <= d AND (dbt_valid_to > d OR dbt_valid_to IS NULL).",
        "Join facts on customer_id and the fact's main date within the validity range.",
      ],
      known_issues: firstDuplicate
        ? [`${firstDuplicate[0]} has 2 current rows (check failed ${TODAY})`]
        : [],
    },
  },
  null,
  2,
);

export function HistoryChecksDrawer() {
  return (
    <Flex h="100%" bg="background_page-secondary">
      <DataStudioTablePicker />
      <DetailPanel defaultWidth={560}>
        <DetailPanelHeader
          icon="table2"
          label={t`Table`}
          title={t`Customers Snapshot`}
          actions={
            <Badge
              color="negative"
              variant="light"
              leftSection={<Icon name="warning" size={12} />}
            >
              {t`2 history checks failed`}
            </Badge>
          }
          onClose={noop}
        />
        <SidebarSection
          title={t`History checks`}
          titleAside={
            <Text size="sm" c="text-secondary">
              {t`Ran after sync · ${TODAY} 07:02`}
            </Text>
          }
        >
          <DetailsTable>
            {getChecks().map((check) => (
              <CheckRow key={check.title} check={check} />
            ))}
          </DetailsTable>
          {firstDuplicate && (
            <Box
              h={130}
              bd="1px solid var(--mb-color-border-neutral)"
              bdrs="lg"
              style={{ overflow: "hidden" }}
            >
              <ResultGrid rows={firstDuplicate[1]} columns={SNAPSHOT_COLUMNS} />
            </Box>
          )}
          <Text size="sm" c="text-secondary">
            {t`The table owner gets a notification when a check starts failing.`}
          </Text>
        </SidebarSection>
      </DetailPanel>
      <DetailPanel defaultWidth={520}>
        <DetailPanelHeader
          icon="metabot"
          label={t`Agent context`}
          title={t`What Metabot reads`}
          onClose={noop}
        />
        <Text c="text-secondary">
          {t`Added to table_details next to name, description, fields, field values, related tables and metrics. Nothing there today says one row is a version.`}
        </Text>
        <Code block fz="xs" style={{ whiteSpace: "pre-wrap" }}>
          {AGENT_CONTEXT}
        </Code>
      </DetailPanel>
    </Flex>
  );
}

type ChatTurn = {
  question: string;
  sql: string;
  answer: ReactNode;
};

const where = (predicate: (row: SnapshotRow) => boolean) =>
  CUSTOMERS_SNAPSHOT.filter(predicate);
const distinctCustomers = (rows: SnapshotRow[]) =>
  new Set(rows.map((row) => row.customer_id)).size;
const isValidOnDate = (row: SnapshotRow, date: string) =>
  isValidOn({ validFrom: row.dbt_valid_from, validTo: row.dbt_valid_to }, date);

const START_OF_YEAR = "2026-01-01";
const proRows = where((row) => row.plan === "Pro");
const currentProCustomers = distinctCustomers(
  proRows.filter((row) => row.dbt_valid_to === null),
);
const everProCustomers = distinctCustomers(proRows);
const rowsBeforeStartOfYear = where(
  (row) => row.dbt_valid_from < START_OF_YEAR,
);
const customersAtStartOfYear = distinctCustomers(
  where((row) => isValidOnDate(row, START_OF_YEAR)),
);

const getTurnsToday = (): ChatTurn[] => [
  {
    question: t`How many customers are on Pro?`,
    sql: `SELECT COUNT(*)
FROM snapshots.customers_snapshot
WHERE plan = 'Pro'`,
    answer: t`${proRows.length} customers are on the Pro plan.`,
  },
  {
    question: t`How many customers did we have at the start of the year?`,
    sql: `SELECT COUNT(*)
FROM snapshots.customers_snapshot
WHERE dbt_valid_from < '${START_OF_YEAR}'`,
    answer: t`${rowsBeforeStartOfYear.length} customers on ${START_OF_YEAR}.`,
  },
];

const getTurnsWithStructure = (): ChatTurn[] => [
  {
    question: t`How many customers are on Pro?`,
    sql: `SELECT COUNT(DISTINCT customer_id)
FROM snapshots.customers_snapshot
WHERE plan = 'Pro'
  AND dbt_valid_to IS NULL`,
    answer: t`${currentProCustomers} customers are on Pro now, and ${everProCustomers} have been on Pro at some point. Birchwood has 2 current rows in this snapshot, so I counted distinct customers.`,
  },
  {
    question: t`How many customers did we have at the start of the year?`,
    sql: `SELECT COUNT(DISTINCT customer_id)
FROM snapshots.customers_snapshot
WHERE dbt_valid_from <= '${START_OF_YEAR}'
  AND (dbt_valid_to > '${START_OF_YEAR}'
       OR dbt_valid_to IS NULL)`,
    answer: t`${customersAtStartOfYear} customers on ${START_OF_YEAR}.`,
  },
];

function MetabotConversation({
  title,
  isCorrect,
  turns,
  footer,
}: {
  title: string;
  isCorrect: boolean;
  turns: ChatTurn[];
  footer: ReactNode;
}) {
  return (
    <Stack flex={1} miw={0} gap={0} bg="background_page-primary">
      <Group
        px="lg"
        py="md"
        gap="sm"
        bd="1px solid var(--mb-color-border-neutral)"
        style={{ borderInline: 0, borderTop: 0 }}
      >
        <Icon name="metabot" c="text-brand" />
        <Text fw="bold">{t`Metabot`}</Text>
        <Badge color={isCorrect ? "positive" : "negative"} variant="light">
          {title}
        </Badge>
      </Group>
      <Stack p="lg" gap="md" style={{ overflowY: "auto" }} flex={1}>
        {turns.map((turn) => (
          <Stack key={turn.question} gap="sm">
            <Paper
              p="sm"
              px="md"
              bg="background_surface-brand-subtle"
              radius="lg"
              style={{ alignSelf: "flex-end", maxWidth: "85%" }}
            >
              <Text>{turn.question}</Text>
            </Paper>
            <Stack gap="xs">
              <Code block fz="xs">
                {turn.sql}
              </Code>
              <Text>{turn.answer}</Text>
            </Stack>
          </Stack>
        ))}
        {footer}
      </Stack>
    </Stack>
  );
}

export function MetabotComparison() {
  return (
    <Flex h="100%" gap={1} bg="border-neutral">
      <MetabotConversation
        title={t`Today`}
        isCorrect={false}
        turns={getTurnsToday()}
        footer={
          <Alert color="error" variant="light" icon={<Icon name="warning" />}>
            {t`Both answers count versions. ${proRows.length} Pro rows belong to ${everProCustomers} customers, and ${currentProCustomers} of them are on Pro now. The ${rowsBeforeStartOfYear.length} rows before ${START_OF_YEAR} are ${customersAtStartOfYear} customers.`}
          </Alert>
        }
      />
      <MetabotConversation
        title={t`With structure`}
        isCorrect
        turns={getTurnsWithStructure()}
        footer={
          <Alert color="success" variant="light" icon={<Icon name="check" />}>
            {t`Follows the rules in the structure block, and mentions the failed check instead of hiding it.`}
          </Alert>
        }
      />
    </Flex>
  );
}
