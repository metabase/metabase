import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import type { SettingWidget, StoredSettings } from "metabase/event-tables";
import { useSelector } from "metabase/redux";
import { Box, Button, Group, Icon, Modal, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import type { Table } from "metabase-types/api";

// ChartSettingsWidget insets itself for the chart settings sidebar.
const WIDGET_STYLE = { marginInline: 0 };

type EventTableSettingsModalProps = {
  table: Table;
  /** The analysis's widgets for the table's settings. */
  widgets: SettingWidget[];
  /** What this analysis changed, to tell overrides from the table's values. */
  stored: StoredSettings;
  opened: boolean;
  onClose: () => void;
};

/**
 * The table's settings as this analysis uses them. Changes here override the
 * table's for this analysis only; the table's own are edited in Data Studio.
 */
export const EventTableSettingsModal = ({
  table,
  widgets,
  stored,
  opened,
  onClose,
}: EventTableSettingsModalProps) => (
  <Modal
    opened={opened}
    title={t`Event table settings`}
    size="lg"
    onClose={onClose}
  >
    <TableSettingsSource table={table} />
    {widgets.map((widget) => (
      <TableSettingWidget
        key={widget.id}
        widget={widget}
        isOverridden={widget.id in stored}
      />
    ))}
  </Modal>
);

type TableSettingWidgetProps = {
  widget: SettingWidget;
  isOverridden: boolean;
};

/**
 * Only an override can be cleared, and clearing it goes back to the table's
 * column: an analysis has no use for leaving out a column the table has.
 */
const TableSettingWidget = ({
  widget: { TitleAction: _TitleAction, ...widget },
  isOverridden,
}: TableSettingWidgetProps) => (
  <ChartSettingsWidget
    {...widget}
    props={{ ...widget.props, isClearable: isOverridden }}
    onChange={(value) => widget.onChange(value ?? undefined)}
    style={WIDGET_STYLE}
  />
);

/**
 * The table's event settings in Data Studio, for someone who can open Data
 * Studio and edit the table; undefined for anyone else.
 */
export const useTableSettingsUrl = (
  table: Table | undefined,
): string | undefined => {
  const hasDataStudioAccess = useSelector(canAccessDataStudio);
  return table !== undefined && table.can_write && hasDataStudioAccess
    ? Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        tab: "events",
      })
    : undefined;
};

type TableSettingsSourceProps = {
  table: Table;
};

/** That changes here stay in this analysis, and where to change them for every one. */
const TableSettingsSource = ({ table }: TableSettingsSourceProps) => {
  const tableSettingsUrl = useTableSettingsUrl(table);
  return (
    <Box bg="background_surface-secondary" p="md" mb="xl" bdrs="md">
      {tableSettingsUrl !== undefined ? (
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Text c="text-secondary">
            {t`Changes here only apply to this analysis. To change these for every analysis of this table, edit them in Data Studio.`}
          </Text>
          <Button
            component={ForwardRefLink}
            to={tableSettingsUrl}
            leftSection={<Icon name="table2" />}
            flex="0 0 auto"
          >{t`Edit in Data Studio`}</Button>
        </Group>
      ) : (
        <Text c="text-secondary">
          {t`Changes here only apply to this analysis. To change these for every analysis of this table, ask an admin to set them up in Data Studio.`}
        </Text>
      )}
    </Box>
  );
};
