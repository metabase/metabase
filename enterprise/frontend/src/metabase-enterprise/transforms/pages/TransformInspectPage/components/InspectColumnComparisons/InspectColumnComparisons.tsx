import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { MultiSelect, SimpleGrid, Stack, Title } from "metabase/ui";
import type {
  TransformInspectColumnComparison,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import { ComparisonCard } from "./ComparisonCard";
import { FieldStatsTable } from "./FieldStatsTable";

type InspectColumnComparisonsProps = {
  comparisons: TransformInspectColumnComparison[];
  sources?: TransformInspectSource[];
  target?: TransformInspectTarget;
};

export const InspectColumnComparisons = ({
  comparisons,
  sources,
  target,
}: InspectColumnComparisonsProps) => {
  const sourceFieldMap = useMemo(() => {
    const fields = sources?.flatMap((s) => s.fields) ?? [];
    return _.indexBy(fields, (item) => item.name);
  }, [sources]);

  const targetFieldMap = useMemo(() => {
    const fields = target?.fields ?? [];
    return _.indexBy(fields, (item) => item.name);
  }, [target]);

  const columnOptions = useMemo(
    () =>
      comparisons.map((c) => ({
        value: c.output_column,
        label: c.output_column,
      })),
    [comparisons],
  );

  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    if (columnOptions.length === 1) {
      return [columnOptions[0].value];
    }
    return [];
  });

  const filteredComparisons = useMemo(
    () => comparisons.filter((c) => selectedColumns.includes(c.output_column)),
    [comparisons, selectedColumns],
  );

  return (
    <Stack gap="lg">
      <Title order={2}>{t`Columns inspection`}</Title>
      <MultiSelect
        data={columnOptions}
        value={selectedColumns}
        onChange={setSelectedColumns}
        placeholder={t`Select output columns`}
        searchable
        clearable
      />
      {filteredComparisons.length > 0 && (
        <Stack gap="md">
          <SimpleGrid cols={2} spacing="md">
            <Title order={4}>{t`Fields in input table(s)`}</Title>
            <Title order={4}>{`Fields in output table`}</Title>
          </SimpleGrid>
          <Stack gap="lg">
            {filteredComparisons.map((comparison) => {
              const inputCard = comparison.cards.find(
                (c) => c.source === "input",
              );
              const outputCard = comparison.cards.find(
                (c) => c.source === "output",
              );

              const sourceField = sourceFieldMap[comparison.output_column];
              const targetField = targetFieldMap[comparison.output_column];

              return (
                <Stack
                  key={comparison.id}
                  gap="md"
                  bg="background-tertiary"
                  bd="1px solid var(--mb-color-border)"
                  bdrs="md"
                  p="md"
                >
                  <SimpleGrid cols={2} spacing="md">
                    <Title order={5}>{inputCard?.title}</Title>
                    <Title order={5}>{outputCard?.title}</Title>
                  </SimpleGrid>

                  <SimpleGrid cols={2} spacing="md">
                    <ComparisonCard card={inputCard} />
                    <ComparisonCard card={outputCard} />
                  </SimpleGrid>

                  <SimpleGrid cols={2} spacing="md">
                    <Title order={5}>{t`Source stats`}</Title>
                    <Title order={5}>{t`Target stats`}</Title>
                  </SimpleGrid>

                  <SimpleGrid cols={2} spacing="md">
                    <FieldStatsTable field={sourceField} />
                    <FieldStatsTable field={targetField} />
                  </SimpleGrid>
                </Stack>
              );
            })}
          </Stack>
        </Stack>
      )}{" "}
    </Stack>
  );
};
