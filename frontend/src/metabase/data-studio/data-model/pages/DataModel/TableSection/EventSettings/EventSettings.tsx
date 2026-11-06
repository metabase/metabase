import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  EVENT_TABLE_ENTITY_TYPE,
  EVENT_TABLE_SETTINGS,
  type EventTableSection,
  type EventTableSettingWidget,
  type EventTableSettings,
  getDetectedEventSchemaName,
  getEventTableSections,
  getEventTableSettings,
  getMissingColumnRoles,
  getSettingWidgets,
  isEventTable,
  updateSettings,
} from "metabase/event-tables";
import { Button, Group, Stack, Text, Title } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import type { EventTableStoredSettings, Table } from "metabase-types/api";

import S from "../TableSection.module.css";

// ChartSettingsWidget insets itself for the chart settings sidebar.
const WIDGET_STYLE = { marginInline: 0 };

type EventSettingsProps = {
  table: Table;
  /** For someone who can't edit the table's metadata. */
  readOnly: boolean;
};

export function EventSettings({ table, readOnly }: EventSettingsProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const stored = table.event_settings ?? {};
  const schemaName = getDetectedEventSchemaName(table);
  const hasUserSettings = Object.keys(stored).length > 0;
  const settings = getEventTableSettings(table);
  const hasMissingColumnRoles = getMissingColumnRoles(settings).length > 0;
  // Product analysis only uses event tables. The entity type is the one
  // switch for that, so these settings wait until it's flipped.
  const isEvent = isEventTable(table);

  const saveSettings = async (newStored: EventTableStoredSettings) => {
    const { error } = await updateTable({
      id: table.id,
      event_settings: newStored,
    });
    if (error) {
      sendErrorToast(t`Failed to update event settings`);
    } else {
      sendSuccessToast(t`Event settings updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          event_settings: stored,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleUseAsEventTable = async () => {
    const { error } = await updateTable({
      id: table.id,
      entity_type: EVENT_TABLE_ENTITY_TYPE,
    });
    if (error) {
      sendErrorToast(t`Failed to update the table`);
    } else {
      sendSuccessToast(t`Entity type updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          entity_type: table.entity_type,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleChange = (changes: Partial<EventTableSettings>) =>
    saveSettings(updateSettings(stored, changes));

  const widgets = getSettingWidgets(
    EVENT_TABLE_SETTINGS,
    { table },
    stored,
    settings,
    handleChange,
  ).filter((widget) => !widget.hidden);

  return (
    <Stack gap="lg" data-testid="table-event-settings">
      {!isEvent && (
        <NotEventTableNotice
          readOnly={readOnly}
          onUseAsEventTable={handleUseAsEventTable}
        />
      )}
      <fieldset className={S.fieldset} disabled={readOnly || !isEvent}>
        <Stack gap="lg">
          {schemaName !== undefined && (
            <Text c="text-secondary" pt="sm">
              {t`Detected as an event table from ${schemaName}.`}
            </Text>
          )}
          {isEvent && hasMissingColumnRoles && (
            <Text c="text-secondary" pt="sm">
              {readOnly
                ? t`This table needs an event time and a person column before product analysis can use it.`
                : t`Pick the required columns to make this table available in product analysis.`}
            </Text>
          )}
          {getEventTableSections(widgets).map((section) => (
            <EventSettingsSection key={section.id} section={section} />
          ))}
          {schemaName !== undefined &&
            hasUserSettings &&
            !readOnly &&
            isEvent && (
              // Without a detected schema, there's nothing to reset to.
              <ResetSettingsButton
                schemaName={schemaName}
                onReset={() => saveSettings({})}
              />
            )}
        </Stack>
      </fieldset>
    </Stack>
  );
}

type NotEventTableNoticeProps = {
  readOnly: boolean;
  onUseAsEventTable: () => void;
};

const NotEventTableNotice = ({
  readOnly,
  onUseAsEventTable,
}: NotEventTableNoticeProps) => (
  <Group justify="space-between" wrap="nowrap" gap="md" className={S.box}>
    <Text c="text-secondary">
      {t`Only tables with an Event entity type can be used in product analysis.`}
    </Text>
    {!readOnly && (
      <Button variant="filled" flex="0 0 auto" onClick={onUseAsEventTable}>
        {t`Set entity type to Event`}
      </Button>
    )}
  </Group>
);

type ResetSettingsButtonProps = {
  schemaName: string;
  onReset: () => Promise<void>;
};

const ResetSettingsButton = ({
  schemaName,
  onReset,
}: ResetSettingsButtonProps) => {
  const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] =
    useDisclosure();

  const handleConfirm = async () => {
    await onReset();
    closeConfirm();
  };

  return (
    <Group>
      <Button
        onClick={openConfirm}
      >{t`Reset to ${schemaName} defaults`}</Button>
      <ConfirmModal
        title={t`Reset to ${schemaName} defaults?`}
        message={t`Every event setting on this table goes back to its ${schemaName} default, including the path cleaning rules.`}
        opened={isConfirmOpen}
        confirmButtonText={t`Reset`}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
      />
    </Group>
  );
};

type EventSettingsSectionProps = {
  section: EventTableSection;
};

const EventSettingsSection = ({
  section: { title, description, widgets },
}: EventSettingsSectionProps) => (
  <Stack gap="lg" className={S.box}>
    <Title order={4}>{title}</Title>
    {description !== undefined && <Text c="text-secondary">{description}</Text>}
    <Stack gap={0}>
      {widgets.map((widget) => (
        <EventSettingWidget key={widget.id} widget={widget} />
      ))}
    </Stack>
  </Stack>
);

type EventSettingWidgetProps = {
  widget: EventTableSettingWidget;
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
