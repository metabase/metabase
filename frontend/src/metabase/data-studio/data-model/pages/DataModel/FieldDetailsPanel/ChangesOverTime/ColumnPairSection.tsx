import { jt, t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  type ColumnPair,
  findColumnByName,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import { getPreviewNames } from "./EndUserPreview";
import {
  type DimensionHistory,
  useDimensionHistory,
} from "./use-dimension-history";
import { useEndUserExample } from "./use-end-user-example";

type ColumnPairSectionProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

export function getThenName(field: Field, pair: ColumnPair) {
  return pair.thenName || t`${field.display_name} at the time`;
}

/**
 * PROTOTYPE: mocked. No default to pick: a changing attribute shows up twice
 * in the column picker, today's value and the value at the time, and people
 * choose per question.
 */
export function ColumnPairSection({
  field,
  table,
  disabled,
}: ColumnPairSectionProps) {
  const history = useDimensionHistory(table);
  const { getColumnPair, setColumnPair } = useChangingAttributes();
  const isTracked = history.trackedFields.some(
    (tracked) => getRawTableFieldId(tracked) === getRawTableFieldId(field),
  );
  if (!isTracked || history.historyTable == null) {
    return null;
  }
  const pair = getColumnPair(field);
  const names = getPreviewNames(history, table, field);

  return (
    <SidebarSection
      title={t`In questions`}
      description={t`Old values of ${field.display_name} are kept, so people get two columns and pick one per question.`}
    >
      <Stack gap="lg">
        <DetailsTable>
          <DetailsRow
            label={t`Today's value`}
            value={
              <Group justify="space-between" wrap="nowrap" w="100%">
                <Text>{field.display_name}</Text>
                <Switch
                  aria-label={t`Show today's value`}
                  checked={pair.showCurrent}
                  disabled={disabled}
                  onChange={(event) =>
                    setColumnPair(field, {
                      showCurrent: event.currentTarget.checked,
                    })
                  }
                />
              </Group>
            }
          />
          <DetailsRow
            label={t`Value at the time`}
            fillValue
            value={
              <Group justify="space-between" wrap="nowrap" w="100%" pr="md">
                <TextInput
                  aria-label={t`Name of the value at the time`}
                  classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                  flex={1}
                  placeholder={getThenName(field, { ...pair, thenName: null })}
                  value={pair.thenName ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    setColumnPair(field, {
                      thenName: event.currentTarget.value || null,
                    })
                  }
                />
                <Switch
                  aria-label={t`Show the value at the time`}
                  checked={pair.showThen}
                  disabled={disabled}
                  onChange={(event) =>
                    setColumnPair(field, {
                      showThen: event.currentTarget.checked,
                    })
                  }
                />
              </Group>
            }
          />
          <DetailsRow
            label={t`Old values`}
            value={
              <Text>{t`Kept in ${history.historyTable.display_name}`}</Text>
            }
          />
        </DetailsTable>
        {history.reference != null && (
          <Text size="sm" c="text-secondary">
            {t`"${getThenName(field, pair)}" uses the ${names.fact.toLowerCase()}'s ${names.eventDate.toLowerCase()}.`}
          </Text>
        )}
        <ColumnPickerMock history={history} table={table} activeField={field} />
        <BothValuesExample history={history} table={table} field={field} />
      </Stack>
    </SidebarSection>
  );
}

function ColumnPickerMock({
  history,
  table,
  activeField,
}: {
  history: DimensionHistory;
  table: Table;
  activeField: Field;
}) {
  const { getColumnPair } = useChangingAttributes();
  const groupName = history.reference?.field.display_name ?? table.display_name;
  const entries = (table.fields ?? [])
    .filter((field) => !isPK(field))
    .flatMap((field) => {
      const isTracked = history.trackedFields.some(
        (tracked) => getRawTableFieldId(tracked) === getRawTableFieldId(field),
      );
      const isActive =
        getRawTableFieldId(field) === getRawTableFieldId(activeField);
      const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
      if (!isTracked) {
        return [
          { key: `${field.id}`, name: field.display_name, icon, isActive },
        ];
      }
      const pair = getColumnPair(field);
      return [
        ...(pair.showCurrent
          ? [{ key: `${field.id}`, name: field.display_name, icon, isActive }]
          : []),
        ...(pair.showThen
          ? [
              {
                key: `${field.id}-then`,
                name: getThenName(field, pair),
                icon: "history" as const,
                isActive,
              },
            ]
          : []),
      ];
    });

  return (
    <Stack gap="xs">
      <Text
        size="sm"
        fw="bold"
      >{t`What people see when they pick a column`}</Text>
      <Paper withBorder radius="md" p="sm" shadow="sm" maw={280}>
        <Stack gap={2}>
          <Text size="xs" fw="bold" c="text-secondary" px="sm" pb="xs">
            {groupName}
          </Text>
          {entries.map((entry) => (
            <Group
              key={entry.key}
              gap="sm"
              px="sm"
              py={6}
              wrap="nowrap"
              bg={
                entry.isActive ? "background_surface-brand-strong" : undefined
              }
              style={{ borderRadius: "var(--mantine-radius-sm)" }}
            >
              <Icon
                name={entry.icon}
                c={entry.isActive ? "text-primary-inverse" : "text-secondary"}
              />
              <Text
                size="sm"
                c={entry.isActive ? "text-primary-inverse" : undefined}
              >
                {entry.name}
              </Text>
            </Group>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

function BothValuesExample({
  history,
  table,
  field,
}: {
  history: DimensionHistory;
  table: Table;
  field: Field;
}) {
  const { getColumnPair } = useChangingAttributes();
  const pair = getColumnPair(field);
  const example = useEndUserExample({
    binding: history.binding,
    historyTable: history.historyTable,
    valueField: findColumnByName(history.historyTable, field),
    dimensionTable: table,
    factTable: history.reference?.table,
    fkField: history.reference?.field,
    eventDateField: history.eventDateField,
  });
  const names = getPreviewNames(history, table, field);

  if (example.status === "loading") {
    return <Loader size="xs" />;
  }
  if (example.status === "unavailable" || example.events.length === 0) {
    return null;
  }
  return (
    <Stack gap="xxs">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Icon name="eye" c="text-secondary" mt={2} />
        <Text size="sm">
          {t`For example, ${example.entityLabel}'s ${field.display_name.toLowerCase()} changed from ${example.before} to ${example.after} on ${example.changedOn}.`}
        </Text>
      </Group>
      {example.events.map((event) => (
        <Text key={event.id} size="sm" c="text-secondary" pl="lg">
          {jt`${names.fact} #${event.id} from ${event.date}: ${field.display_name} is ${(
            <strong key="now">{event.valueNow}</strong>
          )}, ${getThenName(field, pair)} is ${(
            <strong key="then">{event.valueThen}</strong>
          )}.`}
        </Text>
      ))}
    </Stack>
  );
}
