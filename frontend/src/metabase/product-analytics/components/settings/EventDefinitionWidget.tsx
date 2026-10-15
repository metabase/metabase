import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useMetadataProvider } from "metabase/metadata-store";
import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";
import {
  isEventSegment,
  segmentToEventDefinition,
} from "../../segments/to-event-definition";
import type { PaletteSegment } from "../../segments/types";
import type { SettingWidgetProps } from "../../settings/types";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { EventDefinitionSummary } from "../events/EventDefinitionSummary";
import { useTableQuery } from "../events/use-table-query";

type EventDefinitionWidgetProps = SettingWidgetProps<EventDefinition | null> & {
  table: Table | undefined;
  placeholder?: string;
};

/**
 * A collapsed summary of an event definition that expands into an editor, or
 * takes a segment dropped from the palette.
 */
export const EventDefinitionWidget = ({
  id,
  value,
  onChange,
  table,
  placeholder = t`Define the conditions`,
}: EventDefinitionWidgetProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [sendToast] = useToast();
  const tableQuery = useTableQuery(table);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);

  const handleSubmit = (newValue: EventDefinition) => {
    onChange(newValue);
    setIsEditing(false);
  };

  const handleClear = () => {
    onChange(null);
    setIsEditing(true);
  };

  const handleDropSegment = (segment: PaletteSegment) => {
    const event =
      tableQuery !== undefined
        ? segmentToEventDefinition(tableQuery, metadataProvider, segment)
        : undefined;
    if (event === undefined) {
      sendToast({
        icon: "warning",
        message: t`${segment.name} can't be used here yet.`,
      });
      return;
    }
    onChange(event);
    setIsEditing(false);
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
      dropTarget={{ accepts: isEventSegment, onDrop: handleDropSegment }}
      onEdit={() => setIsEditing(true)}
      onRemove={value !== null ? handleClear : undefined}
    />
  );
};
