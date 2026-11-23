import { t } from "ttag";

import {
  Box,
  Card,
  Code,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import {
  DATA_CHECK_CATALOGUE,
  DATA_CHECK_CATEGORIES,
  DATA_CHECK_VIEWS,
} from "../../catalogue";
import type { DataCheckCatalogueEntry, DataCheckViewType } from "../../types";
import { DataCheckRowsTable } from "../DataCheckRowsTable";

const VIEW_ORDER: readonly DataCheckViewType[] = [
  "rows",
  "band",
  "comparison",
  "list",
  "gaps",
  "history",
];

export function DataCheckCoverage() {
  return (
    <Stack gap="xl">
      <SimpleGrid cols={2} spacing="lg">
        {VIEW_ORDER.map((view) => (
          <ViewCard key={view} view={view} />
        ))}
      </SimpleGrid>
      <DataCheckRowsTable
        ariaLabel={t`Every check type and the view that shows its result`}
        rows={DATA_CHECK_CATALOGUE.map(getCoverageRow)}
      />
    </Stack>
  );
}

function ViewCard({ view }: { view: DataCheckViewType }) {
  const { title, component, shows } = DATA_CHECK_VIEWS[view];
  const entries = DATA_CHECK_CATALOGUE.filter((entry) => entry.view === view);
  const total = DATA_CHECK_CATALOGUE.length;

  return (
    <Card withBorder shadow="none" p="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="baseline">
          <Title order={5}>{title}</Title>
          <Text c="text-secondary">{t`${entries.length} of ${total}`}</Text>
        </Group>
        <Text c="text-secondary">{shows}</Text>
        <Box>
          <Code>{component}</Code>
        </Box>
        <Group gap="xs">
          {entries.map((entry) => (
            <Code key={entry.name} opacity={entry.unsupported ? 0.6 : 1}>
              {entry.name}
            </Code>
          ))}
        </Group>
      </Stack>
    </Card>
  );
}

function getCoverageRow(entry: DataCheckCatalogueEntry) {
  return {
    check: entry.name,
    category: `${entry.category}. ${DATA_CHECK_CATEGORIES[entry.category]}`,
    kind: entry.kind,
    parameters: entry.params
      .map((param) => (param.required ? param.name : `${param.name}?`))
      .join(", "),
    "result view": DATA_CHECK_VIEWS[entry.view].title,
    v1: entry.unsupported ? "unsupported" : "runs",
  };
}
