import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Sidesheet } from "metabase/common/components/Sidesheet";
import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableFieldOrder, TableId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { FieldOrderPicker } from "./FieldOrderPicker";
import { SortableField } from "./SortableField";

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
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const fields = useMemo(() => table.fields ?? [], [table.fields]);
  const initialFieldOrder = useMemo(() => getFieldOrder(fields), [fields]);
  const [fieldOrder, setFieldOrder] = useState(initialFieldOrder);
  const items = useMemo(() => {
    return fields.sort((a, b) => {
      return fieldOrder.indexOf(getId(a)) - fieldOrder.indexOf(getId(b));
    });
  }, [fieldOrder, fields]);
  const isDragDisabled = fields.length <= 1;

  const handleSortEnd = ({ itemIds: fieldOrder }: DragEndEvent) => {
    setFieldOrder(fieldOrder);
    dispatch(Tables.actions.setFieldOrder(table, fieldOrder));
  };

  const handleFieldOrderChange = (value: TableFieldOrder) => {
    dispatch(Tables.actions.updateProperty(table, "field_order", value));
  };

  useEffect(() => {
    // Update local state only when sidesheet is closed.
    // This is to prevent items flickering on the list after handleSortEnd.
    if (!isOpen) {
      setFieldOrder(initialFieldOrder);
    }
  }, [initialFieldOrder, isOpen]);

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

      <Flex direction="column" gap="sm">
        <SortableList
          getId={getId}
          items={items}
          renderItem={({ item, id }) => (
            <SortableField
              disabled={isDragDisabled}
              field={item}
              id={id}
              key={id}
            />
          )}
          sensors={[pointerSensor]}
          onSortEnd={handleSortEnd}
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

function getId(field: Field) {
  return field.getId();
}

function getFieldOrder(fields: Field[] | undefined) {
  const sortedFields = _.sortBy(fields ?? [], (field) => field.position);
  return sortedFields.map(getId);
}
