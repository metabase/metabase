import { useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useMetadataProvider } from "metabase/metadata-store";
import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";
import { useSegmentDrag } from "../../segments/drag-context";
import {
  addSegmentToEvent,
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
  /** What an empty value means, for settings that work without one. */
  emptyLabel?: string;
};

/**
 * A collapsed summary of an event definition that expands into an editor, or
 * takes a segment dropped from the palette. Empty, it's a well that says to
 * drag from the palette while it's open, and to click when it isn't.
 */
export const EventDefinitionWidget = ({
  id,
  value,
  onChange,
  table,
  emptyLabel,
}: EventDefinitionWidgetProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { isPaletteOpen } = useSegmentDrag();
  const placeholder =
    emptyLabel ??
    (isPaletteOpen ? t`Drag an event segment here` : t`Click to define this`);
  const [sendToast] = useToast();
  const tableQuery = useTableQuery(table);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);

  const handleSubmit = (newValue: EventDefinition) => {
    onChange(newValue);
    setIsEditing(false);
  };

  const handleClear = () => {
    onChange(null);
    // An empty value is a complete answer when there's an `emptyLabel`.
    setIsEditing(emptyLabel === undefined);
  };

  // A drop on an empty well defines the event; on a filled one, it adds a condition.
  const handleDropSegment = (segment: PaletteSegment) => {
    const event = (() => {
      if (tableQuery === undefined) {
        return undefined;
      }
      return value === null
        ? segmentToEventDefinition(tableQuery, metadataProvider, segment)
        : addSegmentToEvent(tableQuery, metadataProvider, value, segment);
    })();
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
      empty={value === null}
      draggableEvent={value ?? undefined}
      disabled={tableQuery === undefined}
      removeLabel={t`Clear`}
      dropTarget={{ accepts: isEventSegment, onDrop: handleDropSegment }}
      onEdit={() => setIsEditing(true)}
      onRemove={value !== null ? handleClear : undefined}
    />
  );
};
