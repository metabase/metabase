import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Modal,
  Popover,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { EntityTimeline } from "./EntityTimeline";
import { type ResultColumn, ResultGrid } from "./ResultGrid";
import {
  CUSTOMER_IDS,
  type CustomerVersion,
  DIM_CUSTOMER,
  type Plan,
  TODAY,
  countCustomers,
  getVersionsOn,
} from "./sample-data";

const SUMMARIZE_ITEM_STYLE = { color: "var(--mb-color-core-summarize)" };

export type VersionFilter =
  | { type: "current" }
  | { type: "as-of"; date: string }
  | { type: "all" };

const AS_OF_DATES = [
  ...Array.from({ length: 22 }, (_, monthIndex) => {
    const date = new Date(Date.UTC(2025, monthIndex + 1, 0));
    return date.toISOString().slice(0, 10);
  }),
  TODAY,
];

const ALL_COLUMNS: ResultColumn<CustomerVersion>[] = [
  {
    id: "customer_key",
    name: "Customer Key",
    value: (row) => row.customerKey,
    align: "right",
  },
  { id: "customer_id", name: "Customer ID", value: (row) => row.customerId },
  { id: "name", name: "Name", value: (row) => row.name },
  { id: "plan", name: "Plan", value: (row) => row.plan },
  { id: "region", name: "Region", value: (row) => row.region },
  { id: "valid_from", name: "Valid From", value: (row) => row.validFrom },
  { id: "valid_to", name: "Valid To", value: (row) => row.validTo },
  {
    id: "is_current",
    name: "Is Current",
    value: (row) => String(row.isCurrent),
  },
];

function getFilterDate(filter: VersionFilter) {
  switch (filter.type) {
    case "current":
      return TODAY;
    case "as-of":
      return filter.date;
    case "all":
      return null;
  }
}

function getFilterLabel(filter: VersionFilter) {
  switch (filter.type) {
    case "current":
      return t`Current version`;
    case "as-of":
      return t`As of ${filter.date}`;
    case "all":
      return t`All versions`;
  }
}

interface HistoryLensProps {
  isHistoryAware: boolean;
  initialFilter?: VersionFilter;
  initialPlan?: Plan;
  initialCustomerId?: string;
  isFilterPopoverOpen?: boolean;
}

export function HistoryLens({
  isHistoryAware,
  initialFilter = { type: "current" },
  initialPlan,
  initialCustomerId,
  isFilterPopoverOpen = false,
}: HistoryLensProps) {
  const [filter, setFilter] = useState<VersionFilter>(
    isHistoryAware ? initialFilter : { type: "all" },
  );
  const [plan, setPlan] = useState<Plan | undefined>(initialPlan);
  const [openCustomerId, setOpenCustomerId] = useState<string | undefined>(
    initialCustomerId,
  );
  const filterDate = getFilterDate(filter);
  const versions = (
    filterDate === null ? DIM_CUSTOMER : getVersionsOn(filterDate)
  ).filter((version) => plan == null || version.plan === plan);

  return (
    <Flex direction="column" h="100%">
      <QueryHeader isHistoryAware={isHistoryAware} />
      <Group
        gap="sm"
        px="lg"
        py="sm"
        bd="1px solid var(--mb-color-border-neutral)"
        style={{ borderInline: 0, borderTop: 0 }}
      >
        {isHistoryAware && (
          <VersionFilterPill
            filter={filter}
            isInitiallyOpen={isFilterPopoverOpen}
            onChange={setFilter}
          />
        )}
        {plan && (
          <FilterPill onRemoveClick={() => setPlan(undefined)}>
            {t`Plan is ${plan}`}
          </FilterPill>
        )}
      </Group>
      <Flex flex={1} mih={0}>
        <Box flex={1} miw={0}>
          <ResultGrid
            rows={versions}
            columns={ALL_COLUMNS}
            onRowClick={
              isHistoryAware
                ? (row) => setOpenCustomerId(row.customerId)
                : undefined
            }
          />
        </Box>
        <SummarizeSidebar isHistoryAware={isHistoryAware} versions={versions} />
      </Flex>
      <Group
        justify="flex-end"
        px="lg"
        py="sm"
        bd="1px solid var(--mb-color-border-neutral)"
        style={{ borderInline: 0, borderBottom: 0 }}
      >
        <Text size="sm" fw="bold" c="text-secondary">
          {t`Showing ${versions.length} rows`}
        </Text>
      </Group>
      {openCustomerId && (
        <CustomerDetailModal
          customerId={openCustomerId}
          asOf={filterDate ?? TODAY}
          onClose={() => setOpenCustomerId(undefined)}
        />
      )}
    </Flex>
  );
}

function QueryHeader({ isHistoryAware }: { isHistoryAware: boolean }) {
  return (
    <Group justify="space-between" px="lg" py="md" wrap="nowrap">
      <Stack gap={2}>
        <Group gap="xs">
          <Icon name="database" c="text-secondary" size={12} />
          <Text size="sm" c="text-secondary">
            {t`Warehouse / Analytics`}
          </Text>
        </Group>
        <Group gap="sm">
          <Title order={3}>{t`Dim Customer`}</Title>
          {isHistoryAware && (
            <Badge
              color="brand"
              variant="light"
              leftSection={<Icon name="history" size={12} />}
            >
              {t`History · ${CUSTOMER_IDS.length} customers, ${DIM_CUSTOMER.length} versions`}
            </Badge>
          )}
        </Group>
      </Stack>
      <Group gap="sm" wrap="nowrap">
        <Button
          variant="light"
          color="filter"
          leftSection={<Icon name="filter" />}
        >
          {t`Filter`}
        </Button>
        <Button leftSection={<Icon name="sum" c="core-summarize" />}>
          {t`Summarize`}
        </Button>
        <ActionIcon variant="subtle" aria-label={t`Show editor`}>
          <Icon name="notebook" />
        </ActionIcon>
        <Button variant="filled">{t`Save`}</Button>
      </Group>
    </Group>
  );
}

interface VersionFilterPillProps {
  filter: VersionFilter;
  isInitiallyOpen: boolean;
  onChange: (filter: VersionFilter) => void;
}

function VersionFilterPill({
  filter,
  isInitiallyOpen,
  onChange,
}: VersionFilterPillProps) {
  const [isOpen, { toggle, close }] = useDisclosure(isInitiallyOpen);
  const dateIndex = Math.max(
    0,
    AS_OF_DATES.indexOf(filter.type === "as-of" ? filter.date : TODAY),
  );

  const handleTypeChange = (type: string) => {
    if (type === "current") {
      onChange({ type: "current" });
    } else if (type === "as-of") {
      onChange({ type: "as-of", date: AS_OF_DATES[AS_OF_DATES.length - 2] });
    } else {
      onChange({ type: "all" });
    }
  };

  const handleDateChange = (index: number) => {
    const date = AS_OF_DATES[index];
    onChange(date === TODAY ? { type: "current" } : { type: "as-of", date });
  };

  return (
    <Popover
      opened={isOpen}
      onChange={close}
      position="bottom-start"
      shadow="md"
    >
      <Popover.Target>
        <FilterPill
          onClick={toggle}
          onRemoveClick={() => onChange({ type: "all" })}
          data-testid="version-filter-pill"
        >
          <Group gap={6} wrap="nowrap">
            <Icon name="history" size={14} />
            {getFilterLabel(filter)}
          </Group>
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown p="lg" w={360}>
        <Stack gap="md">
          <Text fw="bold">{t`Which versions of each customer?`}</Text>
          <SegmentedControl
            fullWidth
            value={filter.type === "as-of" ? "as-of" : filter.type}
            onChange={handleTypeChange}
            data={[
              { value: "current", label: t`Current` },
              { value: "as-of", label: t`As of a date` },
              { value: "all", label: t`All versions` },
            ]}
          />
          {filter.type !== "all" && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="text-secondary">
                  {t`Valid on`}
                </Text>
                <Text size="sm" fw="bold">
                  {AS_OF_DATES[dateIndex]}
                </Text>
              </Group>
              <Slider
                min={0}
                max={AS_OF_DATES.length - 1}
                value={dateIndex}
                label={null}
                onChange={handleDateChange}
                aria-label={t`As of date`}
              />
            </Stack>
          )}
          <Text size="sm" c="text-secondary">
            {filter.type === "all"
              ? t`Every version is a row, so counts add up versions.`
              : t`Keeps rows where Valid From ≤ the date < Valid To. An empty Valid To means the version is still open.`}
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

type MetricItem = {
  name: string;
  description: string;
  isSelected: boolean;
};

function SummarizeSidebar({
  isHistoryAware,
  versions,
}: {
  isHistoryAware: boolean;
  versions: CustomerVersion[];
}) {
  const metricLabel = isHistoryAware ? t`Count of customers` : t`Count`;
  const metricValue = isHistoryAware
    ? countCustomers(versions)
    : versions.length;
  const sections = isHistoryAware
    ? [
        {
          name: t`History`,
          items: [
            {
              name: t`Count of customers`,
              description: t`Distinct Customer ID`,
              isSelected: true,
            },
            {
              name: t`Count of versions`,
              description: t`Rows`,
              isSelected: false,
            },
            {
              name: t`Changes per customer`,
              description: t`Average`,
              isSelected: false,
            },
          ],
        },
        {
          name: t`Basic metrics`,
          items: [
            {
              name: t`Number of distinct values of …`,
              description: "",
              isSelected: false,
            },
            { name: t`Sum of …`, description: "", isSelected: false },
          ],
        },
      ]
    : [
        {
          name: t`Basic metrics`,
          items: [
            { name: t`Count of rows`, description: "", isSelected: true },
            {
              name: t`Number of distinct values of …`,
              description: "",
              isSelected: false,
            },
            { name: t`Sum of …`, description: "", isSelected: false },
          ],
        },
      ];

  return (
    <Stack
      w={320}
      p="lg"
      gap="lg"
      bd="1px solid var(--mb-color-border-neutral)"
      style={{ borderBlock: 0, borderRight: 0 }}
    >
      <Text fw="bold">{t`Summarize by`}</Text>
      <Button
        variant="filled"
        bg="core-summarize"
        rightSection={<Icon name="close" size={12} />}
        justify="space-between"
      >
        {metricLabel}
      </Button>
      <Stack gap={0}>
        <Text size="sm" c="text-secondary">
          {metricLabel}
        </Text>
        <Title order={1}>{metricValue}</Title>
        {isHistoryAware && (
          <Text size="sm" c="text-secondary">
            {t`${versions.length} versions match these filters`}
          </Text>
        )}
      </Stack>
      <Box
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="md"
        style={{ overflow: "hidden" }}
      >
        <AccordionList<MetricItem>
          sections={sections}
          alwaysExpanded
          color="core-summarize"
          getItemStyles={() => SUMMARIZE_ITEM_STYLE}
          maxHeight={300}
          itemIsSelected={(item) => item.isSelected}
          renderItemName={(item) => item.name}
          renderItemDescription={(item) => item.description || undefined}
          renderItemIcon={() => <Icon name="sum" />}
        />
      </Box>
    </Stack>
  );
}

function CustomerDetailModal({
  customerId,
  asOf,
  onClose,
}: {
  customerId: string;
  asOf: string;
  onClose: () => void;
}) {
  const name = DIM_CUSTOMER.find(
    (version) => version.customerId === customerId,
  )?.name;
  return (
    <Modal
      opened
      size="xl"
      onClose={onClose}
      title={
        <Group gap="sm">
          <Icon name="person" c="text-brand" />
          <Text fw="bold" size="lg">
            {name}
          </Text>
          <Badge color="neutral" variant="light">
            {customerId}
          </Badge>
        </Group>
      }
    >
      <EntityTimeline customerId={customerId} asOf={asOf} />
    </Modal>
  );
}
