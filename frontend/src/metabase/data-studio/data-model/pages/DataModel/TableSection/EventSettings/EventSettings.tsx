import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  EVENT_TABLE_ENTITY_TYPE,
  type EditableColumnRole,
  OPTIONAL_COLUMN_ROLES,
  REQUIRED_COLUMN_ROLES,
  getAnalysisKinds,
  getColumnRoleKey,
  isEventTable,
  isEventTableSetUp,
} from "metabase/product-analytics-core";
import { Button, Group, Icon, Menu, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  EventTableColumnRole,
  EventTableSettings,
  Table,
} from "metabase-types/api";

import { TableSectionGroup } from "../TableSectionGroup";

import { ColumnRoleInput } from "./ColumnRoleInput";
import S from "./EventSettings.module.css";

type EventSettingsProps = {
  table: Table;
};

export function EventSettings({ table }: EventSettingsProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const readOnly = !table.can_write;
  const isEvent = isEventTable(table);
  const isSetUp = isEventTableSetUp(table);

  const updateEventSettings = async (eventSettings: EventTableSettings) => {
    const previousEventSettings = table.event_settings ?? {};
    const { error } = await updateTable({
      id: table.id,
      event_settings: eventSettings,
    });
    if (error) {
      sendErrorToast(t`Failed to update event settings`);
    } else {
      sendSuccessToast(t`Event settings updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          event_settings: previousEventSettings,
        });
        sendUndoToast(error);
      });
    }
  };

  // The API replaces every role, so keep the ones that aren't changing. An
  // explicit `null` says no column plays the role.
  const handleColumnRoleChange = (
    role: EventTableColumnRole,
    columnName: string | null,
  ) =>
    updateEventSettings({
      ...table.event_settings,
      [getColumnRoleKey(role)]: columnName,
    });

  const handleSetEventEntityType = async () => {
    const { error } = await updateTable({
      id: table.id,
      entity_type: EVENT_TABLE_ENTITY_TYPE,
    });
    if (error) {
      sendErrorToast(t`Failed to update entity type`);
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

  const disabled = readOnly || !isEvent;

  return (
    <Stack gap="lg" data-testid="table-event-settings">
      {!isEvent && (
        <NotEventTableNotice
          readOnly={readOnly}
          onSetEventEntityType={handleSetEventEntityType}
        />
      )}
      {isEvent && !isSetUp && (
        <Text c="text-secondary">
          {readOnly
            ? t`This table needs an event time and a person column before product analysis can use it.`
            : t`Pick the required columns to make this table available in product analysis.`}
        </Text>
      )}
      {isEvent && isSetUp && <ReadyNotice table={table} />}
      <ColumnRoleSection
        title={t`Required`}
        table={table}
        roles={REQUIRED_COLUMN_ROLES}
        isRequired
        disabled={disabled}
        onChange={handleColumnRoleChange}
      />
      <ColumnRoleSection
        title={t`Optional`}
        table={table}
        roles={OPTIONAL_COLUMN_ROLES}
        isRequired={false}
        disabled={disabled}
        onChange={handleColumnRoleChange}
      />
    </Stack>
  );
}

type ColumnRoleSectionProps = {
  title: string;
  table: Table;
  roles: readonly EditableColumnRole[];
  isRequired: boolean;
  disabled: boolean;
  onChange: (role: EventTableColumnRole, columnName: string | null) => void;
};

function ColumnRoleSection({
  title,
  table,
  roles,
  isRequired,
  disabled,
  onChange,
}: ColumnRoleSectionProps) {
  return (
    <TableSectionGroup title={title}>
      <div className={S.container}>
        {roles.map((role) => (
          <ColumnRoleInput
            key={role}
            table={table}
            role={role}
            label={getColumnRoleLabel(role)}
            isRequired={isRequired}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    </TableSectionGroup>
  );
}

function getColumnRoleLabel(role: EditableColumnRole): string {
  return match(role)
    .with("timestamp", () => t`Event time`)
    .with("person", () => t`Person`)
    .with("event_name", () => t`Event name`)
    .with("session", () => t`Session`)
    .exhaustive();
}

type ReadyNoticeProps = {
  table: Table;
};

function ReadyNotice({ table }: ReadyNoticeProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text c="text-secondary">
        {t`This table is ready for product analysis.`}
      </Text>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            variant="filled"
            flex="0 0 auto"
            leftSection={<Icon name="add" />}
          >
            {t`New analysis`}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {getAnalysisKinds().map(({ kind, name, icon }) => (
            <Menu.Item
              key={kind}
              component={ForwardRefLink}
              to={Urls.newProductAnalysis(kind, table.id)}
              leftSection={<Icon name={icon} />}
            >
              {name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

type NotEventTableNoticeProps = {
  readOnly: boolean;
  onSetEventEntityType: () => void;
};

function NotEventTableNotice({
  readOnly,
  onSetEventEntityType,
}: NotEventTableNoticeProps) {
  return (
    <TableSectionGroup>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Text c="text-secondary">
          {t`Only tables with an Event entity type can be used in product analysis.`}
        </Text>
        {!readOnly && (
          <Button
            variant="filled"
            flex="0 0 auto"
            onClick={onSetEventEntityType}
          >
            {t`Set entity type to Event`}
          </Button>
        )}
      </Group>
    </TableSectionGroup>
  );
}
