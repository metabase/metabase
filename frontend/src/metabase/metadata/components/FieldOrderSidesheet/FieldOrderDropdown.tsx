import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Button, Icon, Menu } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableFieldOrder, TableId } from "metabase-types/api";
import type { State } from "metabase-types/store/state";

interface OwnProps {
  tableId: TableId;
}

interface Props extends OwnProps {
  table: Table;
  onUpdateTable: (table: Table, name: string, value: TableFieldOrder) => void;
}

/**
 * Using a Record, so that this gives compilation error when TableFieldOrder is extended,
 * so that whoever changes that type does not forget to update this component.
 */
const OPTIONS: Record<TableFieldOrder, TableFieldOrder> = {
  alphabetical: "alphabetical",
  custom: "custom",
  database: "database",
  smart: "smart",
};

const FieldOrderDropdownBase = ({ table, onUpdateTable }: Props) => {
  const handleItemClick = (value: TableFieldOrder) => {
    onUpdateTable(table, "field_order", value);
  };

  return (
    // TODO: use Select/Combobox to highlight current value
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          aria-label={t`Sort`}
          leftSection={<Icon name="sort_arrows" />}
          p={0}
          variant="subtle"
        >
          {getFieldOrderLabel(table.field_order)}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        {Object.values(OPTIONS).map((fieldOrder) => (
          <Menu.Item
            key={fieldOrder}
            onClick={() => handleItemClick(fieldOrder)}
          >
            {getFieldOrderLabel(fieldOrder)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

const getFieldOrderLabel = (fieldOrder: TableFieldOrder) => {
  return match(fieldOrder)
    .with("alphabetical", () => t`Alphabetical`)
    .with("custom", () => t`Custom`)
    .with("database", () => t`Database`)
    .with("smart", () => t`Smart`)
    .exhaustive();
};

const mapDispatchToProps = {
  onUpdateTable: Tables.actions.updateProperty,
};

export const FieldOrderDropdown = _.compose(
  Tables.load({
    id: (_state: State, { tableId }: OwnProps) => tableId,
    query: {
      include_sensitive_fields: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
    selectorName: "getObjectUnfiltered",
  }),
  connect(null, mapDispatchToProps),
)(FieldOrderDropdownBase);
