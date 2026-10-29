import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  EVENT_TABLE_ENTITY_TYPE,
  EVENT_TABLE_SETTINGS,
  type EventTableSettings,
  type SettingWidget,
  getDetectedEventSchemaName,
  getEventTableSettings,
  getMissingColumnRoles,
  getSettingWidgets,
  isEventTable,
  updateSettings,
} from "metabase/event-tables";
import { Stack, Text } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import type { Table } from "metabase-types/api";

// ChartSettingsWidget insets itself for the chart settings sidebar.
const WIDGET_STYLE = { marginInline: 0 };

type EventSettingsProps = {
  table: Table;
};

export function EventSettings({ table }: EventSettingsProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const stored = table.event_settings ?? {};
  const schemaName = getDetectedEventSchemaName(table);
  const hasUserSettings = Object.keys(stored).length > 0;
  const settings = getEventTableSettings(table);
  const hasMissingColumnRoles = getMissingColumnRoles(settings).length > 0;
  // Saving a table's event settings makes it an event table, so product
  // analysis offers it.
  const isMarkingAsEventTable = !isEventTable(table);

  const handleChange = async (changes: Partial<EventTableSettings>) => {
    const { error } = await updateTable({
      id: table.id,
      event_settings: updateSettings(stored, changes),
      ...(isMarkingAsEventTable && { entity_type: EVENT_TABLE_ENTITY_TYPE }),
    });
    if (error) {
      sendErrorToast(t`Failed to update event settings`);
    } else {
      sendSuccessToast(t`Event settings updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          event_settings: stored,
          ...(isMarkingAsEventTable && { entity_type: table.entity_type }),
        });
        sendUndoToast(error);
      });
    }
  };

  const widgets = getSettingWidgets(
    EVENT_TABLE_SETTINGS,
    { table },
    stored,
    settings,
    handleChange,
  ).filter((widget) => !widget.hidden);

  return (
    <Stack gap={0} data-testid="table-event-settings">
      {schemaName !== undefined && !hasUserSettings && (
        <Text c="text-secondary" mb="xl" pt="sm">
          {t`Auto-detected from the table's ${schemaName} schema.`}
        </Text>
      )}
      {hasMissingColumnRoles && (
        <Text c="text-secondary" mb="xl" pt="sm">
          {t`Pick the required columns to make this table available in product analysis.`}
        </Text>
      )}
      {widgets.map((widget) => (
        <EventSettingWidget key={widget.id} widget={widget} />
      ))}
    </Stack>
  );
}

type EventSettingWidgetProps = {
  widget: SettingWidget;
};

const EventSettingWidget = ({
  widget: { TitleAction, ...widget },
}: EventSettingWidgetProps) => (
  <ChartSettingsWidget
    {...widget}
    titleAction={TitleAction !== undefined ? <TitleAction /> : undefined}
    style={WIDGET_STYLE}
  />
);
