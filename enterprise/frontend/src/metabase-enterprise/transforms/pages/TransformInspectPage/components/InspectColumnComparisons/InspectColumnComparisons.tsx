import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { MultiSelect, SimpleGrid, Stack, Tabs, Text, Title } from "metabase/ui";
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
      comparisons.map((c) => ({
        value: c.output_column,
        label: c.output_column,
      })),
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

  const comparisonsMap = useMemo(
    () => _.indexBy(comparisons, (item) => item.output_column),
    [comparisons],
  );

  const unmappedOutputFields = useMemo(
    () => sourcesFields.filter((field) => !comparisonsMap[field.name]),
    [sourcesFields, comparisonsMap],
  );

  return (
    <Stack gap="lg">
      <Title order={2}>{t`Columns inspection`}</Title>
      <Tabs defaultValue="comparisons">
        <Tabs.List>
          <Tabs.Tab value="comparisons">{t`Comparisons`}</Tabs.Tab>
          <Tabs.Tab value="unmapped">{t`Unmapped input fields stats`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="comparisons" pt="md">
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

                    const sourceField =
                      sourceFieldMap[comparison.output_column];
                    const targetField =
                      targetFieldMap[comparison.output_column];

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
                          <FieldsStatsTable field={sourceField} />
                          <FieldsStatsTable field={targetField} />
                        </SimpleGrid>
                      </Stack>
                    );
                  })}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="unmapped" pt="md">
          {unmappedOutputFields.length > 0 ? (
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
                    <FieldsStatsTable field={field} />
                  ) : (
                    <Text>{t`No stats for the field`}</Text>
                  )}
                </Stack>
              ))}
            </Stack>
          ) : (
            <Text>{t`No unmapped input fields`}</Text>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};
