import type { ReactNode } from "react";
import { t } from "ttag";

import {
  type VersionChoice,
  getVersionChoiceOptions,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { Button, Group, Icon, Menu, Stack, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { HistoryKeyAndDates } from "./HistoryKeyAndDates";
import { singularName } from "./names";
import type { DimensionHistory } from "./use-dimension-history";

type ChangingFieldsGroupProps = {
  table: Table;
  history: DimensionHistory;
  historyTable: Table;
  memberFields: Field[];
  readOnly: boolean;
  children: ReactNode;
};

export function joinFieldNames(fields: Field[]) {
  const names = fields.map((field) => field.display_name.toLowerCase());
  if (names.length <= 1) {
    return names.join("");
  }
  return t`${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function getSummary(
  history: DimensionHistory,
  memberFields: Field[],
  version: VersionChoice,
): string | null {
  const { reference, eventDateField } = history;
  if (reference == null) {
    return null;
  }
  if (memberFields.length === 0) {
    return t`No fields yet. Open a field and set its old values to tracked.`;
  }
  const facts = reference.table.display_name;
  const fact = singularName(facts).toLowerCase();
  const dimension = reference.field.display_name.toLowerCase();
  const date = (eventDateField?.display_name ?? t`date`).toLowerCase();
  const attributes = joinFieldNames(memberFields);
  return version === "at-event"
    ? t`${facts} show the ${attributes} each ${dimension} had on the ${fact}'s ${date}.`
    : t`${facts} show each ${dimension}'s current ${attributes}, even on older ${facts.toLowerCase()}.`;
}

/**
 * PROTOTYPE: mocked. The fields whose past values a history table keeps,
 * grouped under it, with the table as a menu for what people get.
 */
export function ChangingFieldsGroup({
  table,
  history,
  historyTable,
  memberFields,
  readOnly,
  children,
}: ChangingFieldsGroupProps) {
  const { getDimensionVersion, setDimensionVersion } = useChangingAttributes();
  const version = getDimensionVersion(table);
  const reference = history.reference;
  const options = getVersionChoiceOptions(
    t`values`,
    singularName(reference?.table.display_name ?? t`Event`).toLowerCase(),
    (history.eventDateField?.display_name ?? t`date`).toLowerCase(),
  );
  const summary = getSummary(history, memberFields, version);

  return (
    <Stack gap="sm" data-testid="changing-fields-group">
      <Group gap="xs" wrap="nowrap">
        <Icon name="history" c="text-secondary" />
        <Text fw="bold">{t`Changes over time in`}</Text>
        <Menu position="bottom-start">
          <Menu.Target>
            <Button
              variant="subtle"
              size="compact-md"
              rightSection={<Icon name="chevrondown" size={12} />}
            >
              {historyTable.display_name}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {reference != null && (
              <>
                <Menu.Label>{t`${reference.table.display_name} show`}</Menu.Label>
                {options.map((option) => (
                  <Menu.Item
                    key={option.value}
                    disabled={readOnly}
                    leftSection={
                      <Icon
                        name="check"
                        opacity={option.value === version ? 1 : 0}
                      />
                    }
                    onClick={() => setDimensionVersion(table, option.value)}
                  >
                    {option.label}
                  </Menu.Item>
                ))}
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
      {summary != null && (
        <Text size="sm" c="text-secondary">
          {summary}
        </Text>
      )}
      <HistoryKeyAndDates
        dimensionTable={table}
        historyTable={historyTable}
        readOnly={readOnly}
      />
      {children}
    </Stack>
  );
}
