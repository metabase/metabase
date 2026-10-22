import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { diagnoseAndCompile } from "metabase/querying/expressions";
import { Box, Button, Flex, Icon, Stack, Text, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryExpression,
} from "../../../components/view/SummarySidebar/types";
import type { SeedFormula } from "../types";

import S from "./SeedControls.module.css";

type CompiledSeed =
  | { formula: SeedFormula; expression: SummaryExpression; error: null }
  | { formula: SeedFormula; expression: null; error: string };

function compileSeed(
  base: SummaryBase,
  database: Database,
  formula: SeedFormula,
): CompiledSeed {
  const { error, expressionClause } = diagnoseAndCompile({
    source: formula.source,
    expressionMode: "aggregation",
    query: base.query,
    stageIndex: base.stageIndex,
    database,
    availableColumns: Lib.aggregableColumns(base.query, base.stageIndex),
    availableMetrics: Lib.availableMetrics(base.query, base.stageIndex),
  });
  if (error != null || expressionClause == null) {
    return {
      formula,
      expression: null,
      error: error?.message ?? t`This formula doesn't compile.`,
    };
  }
  return {
    formula,
    expression: { name: formula.name, clause: expressionClause },
    error: null,
  };
}

type SeedControlsProps = {
  /** The query the summary is built on; formulas compile against it. */
  base: SummaryBase;
  formulas: readonly SeedFormula[];
  onSeed: (expressions: SummaryExpression[]) => void;
};

/**
 * A row of hardcoded custom aggregations for the current data source. Clicking one adds it to the
 * summary's values; formulas that don't compile against the source stay disabled with the error.
 */
export function SeedControls({ base, formulas, onSeed }: SeedControlsProps) {
  const databaseId = Lib.databaseID(base.query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const seeds = useMemo(
    () =>
      database != null
        ? formulas.map((formula) => compileSeed(base, database, formula))
        : [],
    [base, database, formulas],
  );
  const expressions = seeds.flatMap((seed) =>
    seed.expression != null ? [seed.expression] : [],
  );

  return (
    <Flex className={S.root} align="center" gap="sm" wrap="wrap">
      <Text size="sm" fw="bold" c="text-secondary">
        {t`Seed values`}
      </Text>
      {formulas.length === 0 && (
        <Text size="sm" c="text-secondary">
          {t`No seed formulas for this data. Seeds cover the Sample Database tables.`}
        </Text>
      )}
      {seeds.map(({ formula, expression, error }) => (
        <Tooltip
          key={formula.name}
          multiline
          maw={360}
          label={
            <Stack gap="xs">
              <Text c="inherit" size="sm">
                {error ?? formula.description}
              </Text>
              <Text c="inherit" size="sm" ff="monospace">
                {formula.source}
              </Text>
            </Stack>
          }
        >
          {/* a disabled button gets no pointer events, so the tooltip hangs off a wrapper */}
          <Box component="span">
            <Button
              size="compact-sm"
              leftSection={
                <Icon name={error != null ? "warning" : "function"} />
              }
              disabled={expression == null}
              onClick={() => expression != null && onSeed([expression])}
            >
              {formula.name}
            </Button>
          </Box>
        </Tooltip>
      ))}
      {expressions.length > 1 && (
        <Button
          size="compact-sm"
          variant="subtle"
          onClick={() => onSeed(expressions)}
        >
          {t`Add all`}
        </Button>
      )}
    </Flex>
  );
}
