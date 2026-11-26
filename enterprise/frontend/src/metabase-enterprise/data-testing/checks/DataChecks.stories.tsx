import type { Meta, StoryObj } from "@storybook/react";
import { type ReactNode, useState } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import {
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { DATA_CHECK_CATALOGUE, DATA_CHECK_CATEGORIES } from "./catalogue";
import {
  DataCheckForm,
  DataCheckList,
  DataCheckResultCard,
  HistoryBandView,
} from "./components";
import { DQ_FIXTURE, DQ_TABLES, HAND_WRITTEN_VOLUME_HISTORY } from "./fixtures";
import type { DataCheckRun, DataCheckStatus } from "./types";

const meta: Meta = {
  title: "Enterprise/Data Checks (prototype)",
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj;

function getExample(check: string) {
  const example = DQ_FIXTURE.examples.find(
    ({ definition }) => definition.check === check,
  );
  if (example == null) {
    throw new Error(`No fixture for ${check}`);
  }
  return example;
}

function failing(check: string): DataCheckRun {
  const { definition, failing: result } = getExample(check);
  return { definition, result };
}

function passing(check: string): DataCheckRun {
  const { definition, passing: result } = getExample(check);
  return { definition, result };
}

function extra(check: string, status: DataCheckStatus): DataCheckRun {
  const run = DQ_FIXTURE.extras.find(
    ({ result }) => result.check === check && result.status === status,
  );
  if (run == null) {
    throw new Error(`No ${status} fixture for ${check}`);
  }
  return run;
}

const TRANSFORM_TABS = [
  "Definition",
  "Run",
  "Settings",
  "Tests",
  "Checks",
  "Dependencies",
];

type DataStudioPageProps = {
  children: ReactNode;
};

function DataStudioPage({ children }: DataStudioPageProps) {
  return (
    <Box h="100vh">
      <PageContainer>
        <PaneHeader
          showAppSwitcher={false}
          icon="transform"
          title={<PanelHeaderTitle>Orders</PanelHeaderTitle>}
          breadcrumbs={
            <Group gap="sm" c="text-secondary">
              <Text c="text-secondary">Data transformation</Text>
              <Icon name="chevronright" size={10} />
              <Text c="text-secondary">Staging</Text>
              <Icon name="chevronright" size={10} />
              <Text>Orders</Text>
            </Group>
          }
          tabs={
            <Flex gap="xxs" role="tablist">
              {TRANSFORM_TABS.map((tab) => (
                <Box
                  key={tab}
                  role="tab"
                  aria-selected={tab === "Checks"}
                  px="1rem"
                  py="0.6rem"
                  bdrs="xl"
                  fw="bold"
                  lh={1.15}
                  bg={
                    tab === "Checks" ? "background_surface-selected" : undefined
                  }
                  c={tab === "Checks" ? "core-brand" : "text-primary"}
                >
                  {tab}
                </Box>
              ))}
            </Flex>
          }
          actions={
            <Group gap="sm">
              <Button leftSection={<Icon name="add" />}>New check</Button>
              <Button variant="filled" leftSection={<Icon name="play" />}>
                Run checks
              </Button>
            </Group>
          }
        />
        {children}
      </PageContainer>
    </Box>
  );
}

export const AllChecksPass: Story = {
  render: () => (
    <DataStudioPage>
      <DataCheckList runs={DQ_FIXTURE.ordersSuitePassing} />
    </DataStudioPage>
  ),
};

export const SomeChecksFail: Story = {
  render: () => (
    <DataStudioPage>
      <DataCheckList
        runs={DQ_FIXTURE.ordersSuite}
        defaultSelectedId={DQ_FIXTURE.ordersSuite[0]?.result.id}
      />
    </DataStudioPage>
  ),
};

type ResultKind = {
  title: string;
  runs: [DataCheckRun, DataCheckRun];
};

const RESULT_KINDS: ResultKind[] = [
  {
    title: "A rule every row has to follow",
    runs: [failing("accepted_values"), passing("accepted_values")],
  },
  {
    title: "A number that has to stay in range",
    runs: [failing("null_proportion_at_most"), passing("value_share_between")],
  },
  {
    title: "Two tables that have to agree",
    runs: [
      failing("cardinality_equals"),
      passing("row_count_fewer_than_other"),
    ],
  },
  {
    title: "Columns and types that have to match",
    runs: [failing("schema_matches"), passing("schema_matches")],
  },
  {
    title: "A series with no gaps",
    runs: [failing("partition_complete_through"), passing("no_gaps_in_spine")],
  },
];

export const ResultKinds: Story = {
  render: () => (
    <Box bg="background_page-secondary" mih="100vh" p="xl">
      <Stack gap="xl" maw="84rem" mx="auto">
        {RESULT_KINDS.map(({ title, runs }) => (
          <Stack key={title} gap="md">
            <Title order={4}>{title}</Title>
            <SimpleGrid cols={2} spacing="lg" style={{ alignItems: "start" }}>
              {runs.map((run) => (
                <DataCheckResultCard
                  key={run.result.id + run.result.status}
                  {...run}
                />
              ))}
            </SimpleGrid>
          </Stack>
        ))}
        <Stack gap="md">
          <Title order={4}>A number compared with earlier runs</Title>
          <SimpleGrid cols={2} spacing="lg" style={{ alignItems: "start" }}>
            <Card withBorder shadow="none" p="lg">
              <Stack gap="md">
                <Stack gap="xs">
                  <Title order={5}>
                    The number of new rows in orders is in its usual range
                  </Title>
                  <Text c="text-secondary">
                    Mock with made-up numbers. These checks cannot run yet.
                  </Text>
                </Stack>
                <HistoryBandView
                  points={HAND_WRITTEN_VOLUME_HISTORY}
                  unit="rows today"
                />
              </Stack>
            </Card>
            <DataCheckResultCard {...extra("volume_anomaly", "error")} />
          </SimpleGrid>
        </Stack>
      </Stack>
    </Box>
  ),
};

export const StatesThatAreNotPassOrFail: Story = {
  render: () => (
    <Box bg="background_page-secondary" mih="100vh" p="xl">
      <SimpleGrid
        cols={2}
        spacing="lg"
        maw="84rem"
        mx="auto"
        style={{ alignItems: "start" }}
      >
        <DataCheckResultCard {...extra("freshness_within", "warn")} />
        <DataCheckResultCard {...extra("not_null", "error")} />
        <DataCheckResultCard {...extra("not_a_real_check", "error")} />
        <DataCheckResultCard {...extra("row_count_change_within", "error")} />
      </SimpleGrid>
    </Box>
  ),
};

function renamed(run: DataCheckRun, check: string): DataCheckRun {
  const { name: _name, ...definition } = run.definition;
  return {
    definition: { ...definition, check },
    result: { ...run.result, check },
  };
}

export const UnknownCheckType: Story = {
  render: () => (
    <Box bg="background_page-secondary" mih="100vh" p="xl">
      <SimpleGrid
        cols={2}
        spacing="lg"
        maw="84rem"
        mx="auto"
        style={{ alignItems: "start" }}
      >
        <DataCheckResultCard
          {...renamed(failing("valid_format"), "valid_iban")}
        />
        <DataCheckResultCard
          {...renamed(failing("null_proportion_at_most"), "blank_share")}
        />
      </SimpleGrid>
    </Box>
  ),
};

export const EditCheck: Story = {
  render: () => (
    <Box bg="background_page-secondary" mih="100vh" p="xl">
      <Box maw="68rem" mx="auto">
        <DataCheckForm
          initialDefinition={failing("accepted_values").definition}
          tables={DQ_TABLES}
        />
      </Box>
    </Box>
  ),
};

type ShownResult = "failing" | "passing";

const SHOWN_RESULT_OPTIONS: { value: ShownResult; label: string }[] = [
  { value: "failing", label: "Failing" },
  { value: "passing", label: "Passing" },
];

function getRunOfType(check: string, shown: ShownResult): DataCheckRun | null {
  const example = DQ_FIXTURE.examples.find(
    ({ definition }) => definition.check === check,
  );
  if (example != null) {
    return { definition: example.definition, result: example[shown] };
  }
  return (
    DQ_FIXTURE.extras.find(
      ({ result }) => result.check === check && result.reason === "unsupported",
    ) ?? null
  );
}

function EveryCheckTypeGallery() {
  const [shown, setShown] = useState<ShownResult>("failing");

  return (
    <Box bg="background_page-secondary" mih="100vh" p="xl">
      <Stack gap="xl" maw="84rem" mx="auto">
        <SegmentedControl
          value={shown}
          onChange={setShown}
          data={SHOWN_RESULT_OPTIONS}
          w="16rem"
        />
        {Object.entries(DATA_CHECK_CATEGORIES).map(([category, title]) => (
          <Stack key={category} gap="md">
            <Title order={4}>{title}</Title>
            <SimpleGrid cols={2} spacing="lg" style={{ alignItems: "start" }}>
              {DATA_CHECK_CATALOGUE.filter(
                (entry) => String(entry.category) === category,
              ).map((entry) => {
                const run = getRunOfType(entry.name, shown);
                return (
                  run != null && (
                    <Box key={entry.name} data-check-type={entry.name}>
                      <DataCheckResultCard {...run} />
                    </Box>
                  )
                );
              })}
            </SimpleGrid>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export const EveryCheckType: Story = {
  render: () => <EveryCheckTypeGallery />,
};
