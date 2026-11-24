import { useMemo, useState } from "react";

import { Box } from "metabase/ui";
import { getChartSettingLabelId } from "metabase/visualizations/components/settings/get-chart-setting-label-id";
import type * as Lib from "metabase-lib";

import type { AnalysisSettingWidgetProps } from "../../analyses/with-widget-props";
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

type EventDefinitionWidgetProps =
  AnalysisSettingWidgetProps<JsEventDefinition | null> & {
    /** The event table's query, which the event's conditions filter. */
    tableQuery: Lib.Query;
    /** What having no event means. */
    emptyLabel: string;
  };

const getEventName = (tableQuery: Lib.Query, event: EventDefinition) =>
  event.name ?? getConditionsName(getEventQuery(tableQuery, event));

/**
 * An event definition setting: a summary that expands into an editor. It's a
 * group named by the setting's title.
 */
export const EventDefinitionWidget = ({
  id,
  value,
  onChange,
  tableQuery,
  emptyLabel,
}: EventDefinitionWidgetProps) => {
  // The value the editor opened on. Editing ends when the value changes some
  // other way, like browser back, rather than keep a draft of the old one.
  const [editing, setEditing] = useState<{
    value: JsEventDefinition | null;
  } | null>(null);
  const isEditing = editing !== null && editing.value === value;
  const event = useMemo(() => readEventDefinition(value), [value]);

  const handleSubmit = (newEvent: EventDefinition) => {
    onChange(toJsEventDefinition(newEvent));
    setEditing(null);
  };

  return (
    <Box role="group" aria-labelledby={getChartSettingLabelId(id)}>
      {isEditing ? (
        <EventDefinitionEditor
          value={event}
          tableQuery={tableQuery}
          onCancel={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      ) : (
        <EventDefinitionSummary
          name={event !== null ? getEventName(tableQuery, event) : null}
          placeholder={emptyLabel}
          onEdit={() => setEditing({ value })}
          onRemove={event !== null ? () => onChange(null) : undefined}
        />
      )}
    </Box>
  );
};
