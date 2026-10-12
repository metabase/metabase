import { Select } from "metabase/ui";

import type { EventDefinition, EventRef } from "../../events/types";
import type { SettingWidgetProps } from "../../settings/types";

type EventPickerWidgetProps = SettingWidgetProps<EventRef> & {
  events?: readonly EventDefinition[];
};

export const getEventOptions = (events: readonly EventDefinition[]) =>
  events.map((event) => ({ value: event.id, label: event.name }));

export const EventPickerWidget = ({
  id,
  value,
  onChange,
  events = [],
}: EventPickerWidgetProps) => (
  <Select
    id={id}
    data={getEventOptions(events)}
    value={value.id}
    allowDeselect={false}
    onChange={(eventId) => {
      if (eventId !== null) {
        onChange({ type: "saved", id: eventId });
      }
    }}
  />
);
