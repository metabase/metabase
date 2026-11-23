import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Card,
  Code,
  Flex,
  Group,
  Icon,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "metabase/ui";

import {
  DATA_CHECK_CATALOGUE,
  DATA_CHECK_CATEGORIES,
  DATA_CHECK_VIEWS,
  getDataCheckCatalogueEntry,
} from "../../catalogue";
import type { DataCheckTableSchema } from "../../fixtures";
import type {
  DataCheckDefinition,
  DataCheckSeverity,
  DataCheckValue,
} from "../../types";
import { formatDataCheckYaml } from "../../utils";

import { DataCheckParamField } from "./DataCheckParamField";

type DataCheckFormProps = {
  initialDefinition: DataCheckDefinition;
  tables: readonly DataCheckTableSchema[];
};

const SEVERITY_OPTIONS: { value: DataCheckSeverity; label: string }[] = [
  { value: "error", label: "error" },
  { value: "warn", label: "warn" },
];

export function DataCheckForm({
  initialDefinition,
  tables,
}: DataCheckFormProps) {
  const [definition, setDefinition] = useState(initialDefinition);
  const entry = getDataCheckCatalogueEntry(definition.check);
  const checkOptions = useMemo(
    () => getCheckOptions(definition.check),
    [definition.check],
  );
  const tableNames = tables.map((table) => table.name);
  const columns =
    tables.find((table) => table.name === definition.table)?.columns ?? [];

  const handleParamChange = (
    name: string,
    value: DataCheckValue | undefined,
  ) => {
    setDefinition((current) => {
      const { [name]: _removed, ...rest } = current.params;
      return {
        ...current,
        params: value === undefined ? rest : { ...rest, [name]: value },
      };
    });
  };

  return (
    <Flex gap="lg" align="start">
      <Card withBorder shadow="none" p="lg" flex="3 1 0" miw={0}>
        <Stack gap="lg">
          <Stack gap="md">
            <Select
              label={t`Check`}
              description={entry?.summary}
              data={checkOptions}
              value={definition.check}
              onChange={(check) =>
                check != null &&
                setDefinition((current) => ({ ...current, check, params: {} }))
              }
              searchable
            />
            <Select
              label={t`Table`}
              data={
                tableNames.includes(definition.table)
                  ? tableNames
                  : [...tableNames, definition.table]
              }
              value={definition.table}
              onChange={(table) =>
                table != null &&
                setDefinition((current) => ({ ...current, table }))
              }
              searchable
            />
          </Stack>
          <Stack gap="md">
            <Title order={6}>{t`Parameters`}</Title>
            {entry == null ? (
              <UnknownTypeParams definition={definition} />
            ) : (
              entry.params.map((spec) => (
                <DataCheckParamField
                  key={`${definition.check}-${spec.name}`}
                  spec={spec}
                  value={definition.params[spec.name]}
                  columns={columns}
                  tables={tableNames}
                  onChange={(value) => handleParamChange(spec.name, value)}
                />
              ))
            )}
            {entry != null && entry.params.length === 0 && (
              <Text c="text-secondary">{t`This check has no parameters.`}</Text>
            )}
          </Stack>
          <Stack gap="md">
            <Title order={6}>{t`For every check`}</Title>
            <TextInput
              label={t`Name`}
              description={t`What a failure leads with`}
              value={definition.name ?? ""}
              onChange={(event) =>
                setDefinition((current) => ({
                  ...current,
                  name: event.target.value || undefined,
                }))
              }
            />
            <Textarea
              label={t`Only check rows where`}
              description={t`SQL, passed through as written`}
              autosize
              minRows={1}
              value={definition.where ?? ""}
              onChange={(event) =>
                setDefinition((current) => ({
                  ...current,
                  where: event.target.value || undefined,
                }))
              }
            />
            <Stack gap="xs">
              <Text fw="bold">{t`When it fails`}</Text>
              <SegmentedControl
                value={definition.severity ?? "error"}
                onChange={(severity) =>
                  setDefinition((current) => ({ ...current, severity }))
                }
                data={SEVERITY_OPTIONS}
              />
            </Stack>
          </Stack>
        </Stack>
      </Card>
      <Stack flex="2 1 0" miw={0} gap="md">
        <Card withBorder shadow="none" p="lg">
          <Stack gap="sm">
            <Title order={6}>{t`YAML`}</Title>
            <Code block>{formatDataCheckYaml(definition)}</Code>
          </Stack>
        </Card>
        {entry != null && (
          <Card withBorder shadow="none" p="lg">
            <Stack gap="sm">
              <Title order={6}>{t`How the result is shown`}</Title>
              <Text fw="bold">{DATA_CHECK_VIEWS[entry.view].title}</Text>
              <Text c="text-secondary">
                {DATA_CHECK_VIEWS[entry.view].shows}
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </Flex>
  );
}

function UnknownTypeParams({
  definition,
}: {
  definition: DataCheckDefinition;
}) {
  return (
    <Stack gap="sm">
      <Group
        gap="sm"
        p="md"
        bdrs="md"
        bg="background_page-secondary"
        wrap="nowrap"
      >
        <Icon name="info" c="text-secondary" flex="none" />
        <Text c="text-secondary">
          {t`This version does not know the parameters of ${definition.check}. They are kept as written and can be edited in the YAML file.`}
        </Text>
      </Group>
      <Code block>
        {Object.entries(definition.params)
          .map(([name, value]) => `${name}: ${JSON.stringify(value)}`)
          .join("\n")}
      </Code>
    </Stack>
  );
}

function getCheckOptions(currentCheck: string) {
  const groups = Object.entries(DATA_CHECK_CATEGORIES).map(
    ([category, group]) => ({
      group,
      items: DATA_CHECK_CATALOGUE.filter(
        (entry) => String(entry.category) === category,
      ).map((entry) => ({ value: entry.name, label: entry.name })),
    }),
  );
  return getDataCheckCatalogueEntry(currentCheck) == null
    ? [
        ...groups,
        {
          group: t`Unknown to this version`,
          items: [{ value: currentCheck, label: currentCheck }],
        },
      ]
    : groups;
}
