import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Alert,
  Box,
  Code,
  Loader,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import type { Dataset } from "metabase-types/api";

import { defaultSpec } from "../defaults";
import type { AnalysisKind } from "../spec/types";
import { useAnalysisQuery } from "../use-analysis-query";
import { DEFAULT_DATE_FILTER } from "../use-analysis-state";
import { usePrototypeTable } from "../use-prototype-table";

const KINDS: AnalysisKind[] = [
  "funnel",
  "paths",
  "habit",
  "lifecycle",
  "cohorts",
];

const isKind = (value: string | null): value is AnalysisKind =>
  value !== null && KINDS.some((kind) => kind === value);

const ResultTable = ({ dataset }: { dataset: Dataset }) => {
  const cols = dataset.data.cols;
  const rows = dataset.data.rows.slice(0, 50);
  if (cols.length === 0) {
    return <Text c="text-secondary">{t`No columns.`}</Text>;
  }
  return (
    <ScrollArea>
      <Box component="table" w="100%" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((col) => (
              <Box
                component="th"
                key={col.name}
                ta="left"
                p="sm"
                style={{ borderBottom: "1px solid var(--mb-color-border)" }}
              >
                {col.display_name}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, colIndex) => (
                <Box
                  component="td"
                  key={colIndex}
                  p="sm"
                  style={{ borderBottom: "1px solid var(--mb-color-border)" }}
                >
                  {value === null ? "—" : String(value)}
                </Box>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
      {dataset.data.rows.length > 50 && (
        <Text c="text-secondary" mt="sm">
          {t`Showing 50 of ${dataset.data.rows.length} rows`}
        </Text>
      )}
    </ScrollArea>
  );
};

export const ProductAnalyticsDebugPage = () => {
  const [kind, setKind] = useState<AnalysisKind>("funnel");
  const spec = useMemo(() => defaultSpec(kind), [kind]);
  const prototype = usePrototypeTable();
  const { sql, dataset, warnings, isLoading, error } = useAnalysisQuery({
    spec,
    tableId: prototype.tableId,
    dateFilter: DEFAULT_DATE_FILTER,
  });
  const pageError = prototype.error ?? error;

  return (
    <Box p="xl" maw={1200} mx="auto">
      <Stack gap="lg">
        <div>
          <Title order={2}>{t`Product analytics debug`}</Title>
          <Text c="text-secondary">
            {t`Compiles a Lib base query to SQL, wraps it in the analysis templates, and runs it on Product Analytics / pa_events_resolved.`}
          </Text>
        </div>

        <Tabs
          value={kind}
          onChange={(value) => {
            if (isKind(value)) {
              setKind(value);
            }
          }}
        >
          <Tabs.List>
            {KINDS.map((item) => (
              <Tabs.Tab key={item} value={item}>
                {item}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        {warnings.map((warning) => (
          <Alert key={warning} color="warning">
            {warning}
          </Alert>
        ))}

        {pageError && <Alert color="error">{pageError}</Alert>}

        {(isLoading || prototype.isLoading) && (
          <Box ta="center" py="xl">
            <Loader />
          </Box>
        )}

        <div>
          <Title order={4}>{t`Spec`}</Title>
          <ScrollArea mah={240}>
            <Code block>{JSON.stringify(spec, null, 2)}</Code>
          </ScrollArea>
        </div>

        {sql && (
          <div>
            <Title order={4}>{t`SQL`}</Title>
            <ScrollArea mah={360}>
              <Code block>{sql}</Code>
            </ScrollArea>
          </div>
        )}

        {dataset && !isLoading && (
          <div>
            <Title order={4}>{t`Results`}</Title>
            <ResultTable dataset={dataset} />
          </div>
        )}
      </Stack>
    </Box>
  );
};
