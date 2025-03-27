import { t } from "ttag";
import _ from "underscore";

import { Sidesheet } from "metabase/common/components/Sidesheet";
import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableFieldOrder, TableId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { FieldOrderPicker } from "./FieldOrderPicker";

interface OwnProps {
  tableId: TableId;
  isOpen: boolean;
  onClose: () => void;
}

interface Props extends OwnProps {
  table: Table;
  onUpdateTable: (table: Table, name: string, value: TableFieldOrder) => void;
}

const FieldOrderSidesheetBase = ({
  isOpen,
  table,
  onClose,
  onUpdateTable,
}: Props) => {
  const handleFieldOrderChange = (value: TableFieldOrder) => {
    onUpdateTable(table, "field_order", value);
  };

  return (
    <Sidesheet title={t`Edit column order`} onClose={onClose} isOpen={isOpen}>
      <Flex>
        <FieldOrderPicker
          value={table.field_order}
          onChange={handleFieldOrderChange}
        />
      </Flex>
    </Sidesheet>
  );
};

const mapDispatchToProps = {
  onUpdateTable: Tables.actions.updateProperty,
};

export const FieldOrderSidesheet = _.compose(
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
)(FieldOrderSidesheetBase);
