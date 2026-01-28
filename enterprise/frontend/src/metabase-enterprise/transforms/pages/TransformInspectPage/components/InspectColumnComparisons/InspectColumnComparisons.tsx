import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  Box,
  MultiSelect,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import type {
  TransformInspectColumnComparison,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import { ComparisonCard } from "./ComparisonCard";
import { FieldsStatsTable } from "./FieldsStatsTable";

type InspectColumnComparisonsProps = {
  comparisons: TransformInspectColumnComparison[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
};

export const InspectColumnComparisons = ({
  comparisons,
  sources,
  target,
}: InspectColumnComparisonsProps) => {
  const sourcesFields = useMemo(
    () => sources.flatMap((s) => s.fields),
    [sources],
  );
  const sourceFieldMap = useMemo(
    () => _.indexBy(sourcesFields, (item) => item.name),
    [sourcesFields],
  );

  const targetFieldMap = useMemo(() => {
    const fields = target?.fields ?? [];
    return _.indexBy(fields, (item) => item.name);
  }, [target]);

  const fieldsOptions = useMemo(
    () =>
      comparisons
        .map((c) => ({
          value: c.output_column,
          label: c.output_column,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [comparisons],
  );

  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    if (fieldsOptions.length === 1) {
      return [fieldsOptions[0].value];
    }
    return [];
  });

  const filteredComparisons = useMemo(
    () => comparisons.filter((c) => selectedFields.includes(c.output_column)),
    [comparisons, selectedFields],
  );

  // Build a set of mapped source field names by looking at input cards
  // This handles joined columns where output_column has a prefix like "Table__field"
  const mappedSourceFieldNames = useMemo(() => {
    const mapped = new Set<string>();
    for (const comparison of comparisons) {
      for (const card of comparison.cards) {
        if (card.source === "input" && card.field_name) {
          mapped.add(card.field_name);
        }
      }
    }
    return mapped;
  }, [comparisons]);

  const unmappedOutputFields = useMemo(
    () =>
      sourcesFields.filter((field) => !mappedSourceFieldNames.has(field.name)),
    [sourcesFields, mappedSourceFieldNames],
  );

  const comparisonsContent = (
    <Stack gap="lg">
      <MultiSelect
        data={fieldsOptions}
        value={selectedFields}
        onChange={setSelectedFields}
        placeholder={t`Select output fields`}
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
                    <Box>
                      {inputCard && (
                        <Title order={5}>
                          {`${inputCard.table_name} → ${inputCard.field_name}`}
                        </Title>
                      )}
                    </Box>
                    <Title order={5}>{outputCard?.field_name}</Title>
                  </SimpleGrid>

                  <SimpleGrid cols={2} spacing="md">
                    <Box>
                      {inputCard && <ComparisonCard card={inputCard} />}
                    </Box>
                    <ComparisonCard card={outputCard} />
                  </SimpleGrid>

                  {(sourceField?.stats || targetField?.stats) && (
                    <>
                      <SimpleGrid cols={2} spacing="md">
                        <Box>
                          {sourceField?.stats && (
                            <Title order={5}>{t`Source stats`}</Title>
                          )}
                        </Box>
                        {targetField?.stats && (
                          <Title order={5}>{t`Target stats`}</Title>
                        )}
                      </SimpleGrid>

                      <SimpleGrid cols={2} spacing="md">
                        <Box>
                          {sourceField?.stats && (
                            <FieldsStatsTable stats={sourceField?.stats} />
                          )}
                        </Box>
                        {targetField?.stats && (
                          <FieldsStatsTable stats={targetField?.stats} />
                        )}
                      </SimpleGrid>
                    </>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </Stack>
      )}
    </Stack>
  );

  return (
    <Stack gap="lg">
      <Title order={2}>{t`Columns inspection`}</Title>
      {unmappedOutputFields.length > 0 ? (
        <Tabs defaultValue="comparisons">
          <Tabs.List>
            <Tabs.Tab value="comparisons">{t`Comparisons`}</Tabs.Tab>
            <Tabs.Tab value="unmapped">{t`Unmapped input fields stats`}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="comparisons" pt="md">
            {comparisonsContent}
          </Tabs.Panel>

          <Tabs.Panel value="unmapped" pt="md">
            <Stack gap="lg">
              {unmappedOutputFields.map((field) => (
                <Stack
                  key={field.name}
                  gap="md"
                  bg="background-tertiary"
                  bd="1px solid var(--mb-color-border)"
                  bdrs="md"
                  p="md"
                >
                  <Title order={5}>{field.name}</Title>
                  {field.stats ? (
                    <FieldsStatsTable stats={field.stats} />
                  ) : (
                    <Text>{t`No stats for the field`}</Text>
                  )}
                </Stack>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      ) : (
        comparisonsContent
      )}
    </Stack>
  );
};
