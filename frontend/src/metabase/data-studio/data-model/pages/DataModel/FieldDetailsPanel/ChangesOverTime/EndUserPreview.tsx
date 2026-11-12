import { jt, t } from "ttag";

import {
  type VersionChoice,
  findColumnByName,
} from "metabase/metadata/table-structure";
import { Group, Icon, Loader, Stack, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { singularName } from "./names";
import type { DimensionHistory } from "./use-dimension-history";
import { type EndUserExample, useEndUserExample } from "./use-end-user-example";

export type PreviewNames = {
  facts: string;
  fact: string;
  dimension: string;
  attribute: string;
  eventDate: string;
};

type EndUserPreviewProps = {
  names: PreviewNames;
  version: VersionChoice;
  example: EndUserExample;
};

const lower = (name: string) => name.toLowerCase();

function getSentence(names: PreviewNames, version: VersionChoice) {
  const { facts, fact, dimension, attribute, eventDate } = names;
  return version === "at-event"
    ? t`Grouping ${facts} by ${dimension} → ${attribute} uses the ${lower(attribute)} the ${lower(dimension)} had on the ${lower(fact)}'s ${lower(eventDate)}.`
    : t`Grouping ${facts} by ${dimension} → ${attribute} uses the ${lower(dimension)}'s current ${lower(attribute)}, even on older ${lower(facts)}.`;
}

export function getPreviewNames(
  history: DimensionHistory,
  dimensionTable: Table,
  attribute: Field,
): PreviewNames {
  const { reference, eventDateField } = history;
  return {
    facts: reference?.table.display_name ?? t`Events`,
    fact: singularName(reference?.table.display_name ?? t`Event`),
    dimension: reference?.field.display_name ?? dimensionTable.display_name,
    attribute: attribute.display_name,
    eventDate: eventDateField?.display_name ?? t`Date`,
  };
}

/**
 * One sentence on what a version choice means, and one real change that
 * shows it: what two events by the same entity show around that change.
 */
export function EndUserPreview({
  names,
  version,
  example,
}: EndUserPreviewProps) {
  return (
    <Stack gap="sm" data-testid="end-user-preview">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Icon name="eye" c="text-secondary" mt={2} />
        <Text size="sm">{getSentence(names, version)}</Text>
      </Group>
      <ExampleSentences names={names} version={version} example={example} />
    </Stack>
  );
}

/** The end-user preview for one attribute of a dimension with history */
export function DimensionChangePreview({
  history,
  dimensionTable,
  attribute,
  version,
}: {
  history: DimensionHistory;
  dimensionTable: Table;
  attribute: Field;
  version: VersionChoice;
}) {
  const example = useEndUserExample({
    binding: history.binding,
    historyTable: history.historyTable,
    valueField: findColumnByName(history.historyTable, attribute),
    dimensionTable,
    factTable: history.reference?.table,
    fkField: history.reference?.field,
    eventDateField: history.eventDateField,
  });
  if (history.reference == null) {
    return null;
  }
  return (
    <EndUserPreview
      names={getPreviewNames(history, dimensionTable, attribute)}
      version={version}
      example={example}
    />
  );
}

function ExampleSentences({ names, version, example }: EndUserPreviewProps) {
  if (example.status === "loading") {
    return <Loader size="xs" />;
  }
  if (example.status === "unavailable" || example.events.length === 0) {
    return null;
  }
  return (
    <Stack gap="xxs" pl="lg">
      <Text size="sm" c="text-secondary">
        {t`For example, ${example.entityLabel}'s ${lower(names.attribute)} changed from ${example.before} to ${example.after} on ${example.changedOn}.`}
      </Text>
      {example.events.map((event) => (
        <Text key={event.id} size="sm" c="text-secondary">
          {jt`${names.fact} #${event.id} from ${event.date} shows ${(
            <strong key="value">
              {version === "at-event" ? event.valueThen : event.valueNow}
            </strong>
          )}.`}
        </Text>
      ))}
    </Stack>
  );
}
