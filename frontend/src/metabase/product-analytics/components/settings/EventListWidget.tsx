import { t } from "ttag";

import { ActionIcon, Button, Group, Icon, Select, Stack } from "metabase/ui";

import type { EventDefinition, EventRef } from "../../events/types";
import type { SettingWidgetProps } from "../../settings/types";

import { getEventOptions } from "./EventPickerWidget";

type EventListWidgetProps = SettingWidgetProps<EventRef[]> & {
  events?: readonly EventDefinition[];
  minCount?: number;
};

export const EventListWidget = ({
  id,
  value,
  onChange,
  events = [],
  minCount = 0,
}: EventListWidgetProps) => {
  const options = getEventOptions(events);
  const canRemove = value.length > minCount;
  const nextEvent =
    events.find((event) => !value.some((ref) => ref.id === event.id)) ??
    events[0];

  const replaceAt = (index: number, eventId: string) =>
    onChange(
      value.map((ref, refIndex) =>
        refIndex === index ? { type: "saved", id: eventId } : ref,
      ),
    );

  return (
    <Stack id={id} gap="sm">
      {value.map((ref, index) => (
        <Group key={index} gap="xs" wrap="nowrap">
          <Select
            flex={1}
            data={options}
            value={ref.id}
            allowDeselect={false}
            aria-label={t`Event ${index + 1}`}
            onChange={(eventId) => {
              if (eventId !== null) {
                replaceAt(index, eventId);
              }
            }}
          />
          <ActionIcon
            variant="subtle"
            aria-label={t`Remove`}
            disabled={!canRemove}
            onClick={() =>
              onChange(value.filter((_ref, refIndex) => refIndex !== index))
            }
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
      ))}
      {nextEvent !== undefined && (
        <Button
          variant="subtle"
          leftSection={<Icon name="add" />}
          onClick={() =>
            onChange([...value, { type: "saved", id: nextEvent.id }])
          }
        >
          {t`Add step`}
        </Button>
      )}
    </Stack>
  );
};
