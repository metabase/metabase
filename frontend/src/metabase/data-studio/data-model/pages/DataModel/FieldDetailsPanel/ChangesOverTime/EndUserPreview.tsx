import { t } from "ttag";

import type { VersionChoice } from "metabase/metadata/table-structure";
import {
  Divider,
  Group,
  Icon,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "metabase/ui";

import type { EndUserExample } from "./use-end-user-example";

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

/**
 * One sentence on what a version choice means, and two real rows that show
 * it: what people get when they group the fact table by the attribute.
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
      <ExampleRows names={names} version={version} example={example} />
    </Stack>
  );
}

function ExampleRows({ names, version, example }: EndUserPreviewProps) {
  if (example.status === "loading") {
    return <Loader size="xs" />;
  }
  if (example.status === "unavailable" || example.events.length === 0) {
    return null;
  }
  return (
    <Paper
      withBorder
      radius="md"
      px="md"
      py="sm"
      bg="background_page-secondary"
    >
      <Stack gap="xs">
        <SimpleGrid cols={3} spacing="md">
          <Text size="xs" fw="bold" c="text-secondary">
            {names.fact}
          </Text>
          <Text size="xs" fw="bold" c="text-secondary">
            {names.eventDate}
          </Text>
          <Text size="xs" fw="bold" c="text-secondary">
            {`${names.dimension} → ${names.attribute}`}
          </Text>
        </SimpleGrid>
        {example.events.map((event) => (
          <Stack key={event.id} gap="xs">
            <Divider />
            <SimpleGrid cols={3} spacing="md">
              <Text size="sm">{`#${event.id}`}</Text>
              <Text size="sm">{event.date}</Text>
              <Text size="sm" fw="bold">
                {version === "at-event" ? event.valueThen : event.valueNow}
              </Text>
            </SimpleGrid>
          </Stack>
        ))}
        <Divider />
        <Text size="xs" c="text-secondary">
          {t`${example.entityLabel}'s ${lower(names.attribute)} changed from ${example.before} to ${example.after} on ${example.changedOn}.`}
        </Text>
      </Stack>
    </Paper>
  );
}
