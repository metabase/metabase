import { useState } from "react";
import { t } from "ttag";

import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";
import type { SettingWidgetProps } from "../../settings/types";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { EventDefinitionSummary } from "../events/EventDefinitionSummary";
import { useTableQuery } from "../events/use-table-query";

type EventDefinitionWidgetProps = SettingWidgetProps<EventDefinition | null> & {
  table: Table | undefined;
  placeholder?: string;
};

/** A collapsed summary of an event definition that expands into an editor. */
export const EventDefinitionWidget = ({
  id,
  value,
  onChange,
  table,
  placeholder = t`Define the conditions`,
}: EventDefinitionWidgetProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const tableQuery = useTableQuery(table);

  const handleSubmit = (newValue: EventDefinition) => {
    onChange(newValue);
    setIsEditing(false);
  };

  const handleClear = () => {
    onChange(null);
    setIsEditing(true);
  };

  if (isEditing && tableQuery !== undefined) {
    return (
      <EventDefinitionEditor
        id={id}
        value={value}
        tableQuery={tableQuery}
        onCancel={() => setIsEditing(false)}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <EventDefinitionSummary
      id={id}
      name={value?.name}
      placeholder={placeholder}
      disabled={tableQuery === undefined}
      removeLabel={t`Clear`}
      onEdit={() => setIsEditing(true)}
      onRemove={value !== null ? handleClear : undefined}
    />
  );
};
