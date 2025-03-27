import { t } from "ttag";
import _ from "underscore";

import { Sidesheet } from "metabase/common/components/Sidesheet";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import type { FieldId, TableFieldOrder, TableId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { FieldOrderPicker } from "./FieldOrderPicker";

/**
 * This is to prevent FieldOrderPicker's focus state outline being cut off.
 * Mantine Button's outline-width is 2px.
 */
const BUTTON_OUTLINE_WIDTH = 2;

interface OwnProps {
  tableId: TableId;
  isOpen: boolean;
  onClose: () => void;
}

interface Props extends OwnProps {
  table: Table;
}

const FieldOrderSidesheetBase = ({ isOpen, table, onClose }: Props) => {
  const dispatch = useDispatch();

  const handleDragAndDrop = (fieldOrder: FieldId[]) => {
    dispatch(Tables.actions.setFieldOrder(table, fieldOrder));
  };

  const handleFieldOrderChange = (value: TableFieldOrder) => {
    dispatch(Tables.actions.setFieldOrder(table, "field_order", value));
  };

  return (
    <Sidesheet isOpen={isOpen} title={t`Edit column order`} onClose={onClose}>
      <Flex pt={BUTTON_OUTLINE_WIDTH}>
        <FieldOrderPicker
          m={-BUTTON_OUTLINE_WIDTH}
          p={BUTTON_OUTLINE_WIDTH}
          value={table.field_order}
          onChange={handleFieldOrderChange}
        />
      </Flex>
    </Sidesheet>
  );
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
)(FieldOrderSidesheetBase);
