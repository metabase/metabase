import { useMemo, useState } from "react";

import type * as Lib from "metabase-lib";

import {
  type EventDefinition,
  type JsEventDefinition,
  getConditionsName,
  getEventQuery,
  readEventDefinition,
  toJsEventDefinition,
} from "../../event-definition";

import { EventDefinitionEditor } from "./EventDefinitionEditor";
import { EventDefinitionSummary } from "./EventDefinitionSummary";

type EventDefinitionWidgetProps = {
  value: JsEventDefinition | null;
  onChange: (value: JsEventDefinition | null) => void;
  /** The event table's query, which the event's conditions filter. */
  tableQuery: Lib.Query;
  /** What having no event means. */
  emptyLabel: string;
};

const getEventName = (tableQuery: Lib.Query, event: EventDefinition) =>
  event.name ?? getConditionsName(getEventQuery(tableQuery, event));

/** An event definition setting: a summary that expands into an editor. */
export const EventDefinitionWidget = ({
  value,
  onChange,
  tableQuery,
  emptyLabel,
}: EventDefinitionWidgetProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const event = useMemo(() => readEventDefinition(value), [value]);

  const handleSubmit = (newEvent: EventDefinition) => {
    onChange(toJsEventDefinition(newEvent));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <EventDefinitionEditor
        value={event}
        tableQuery={tableQuery}
        onCancel={() => setIsEditing(false)}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <EventDefinitionSummary
      name={event !== null ? getEventName(tableQuery, event) : null}
      placeholder={emptyLabel}
      onEdit={() => setIsEditing(true)}
      onRemove={event !== null ? () => onChange(null) : undefined}
    />
  );
};
