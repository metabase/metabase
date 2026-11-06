import { useState } from "react";
import { t } from "ttag";

import type { SettingWidgetProps } from "metabase/event-tables";
import { Button, Icon, Stack } from "metabase/ui";
import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";

import { EventDefinitionWidget } from "./EventDefinitionWidget";

type EventDefinitionSetWidgetProps = SettingWidgetProps<EventDefinition[]> & {
  table: Table | undefined;
};

/**
 * Event definitions in no particular order, unlike a funnel's steps: no
 * numbers and no reordering. Clearing an event removes it.
 */
export const EventDefinitionSetWidget = ({
  id,
  value,
  onChange,
  table,
}: EventDefinitionSetWidgetProps) => {
  const [isAdding, setIsAdding] = useState(false);

  const handleChange = (
    changedIndex: number,
    changed: EventDefinition | null,
  ) =>
    onChange(
      changed === null
        ? value.filter((_event, index) => index !== changedIndex)
        : value.map((event, index) =>
            index === changedIndex ? changed : event,
          ),
    );

  const handleAdd = (event: EventDefinition | null) => {
    if (event !== null) {
      onChange([...value, event]);
    }
    setIsAdding(false);
  };

  return (
    <Stack id={id} gap="sm">
      {value.length > 0 && (
        <Stack gap="sm" role="list">
          {value.map((event, index) => (
            <div key={index} role="listitem">
              <EventDefinitionWidget
                id={`${id}-${index}`}
                value={event}
                table={table}
                removeLabel={t`Remove`}
                onChange={(changed) => handleChange(index, changed)}
              />
            </div>
          ))}
        </Stack>
      )}
      {value.length === 0 || isAdding ? (
        <EventDefinitionWidget
          id={`${id}-new`}
          value={null}
          table={table}
          onChange={handleAdd}
        />
      ) : (
        <Button
          variant="light"
          leftSection={<Icon name="add" />}
          disabled={table === undefined}
          onClick={() => setIsAdding(true)}
        >
          {t`Add another`}
        </Button>
      )}
    </Stack>
  );
};
