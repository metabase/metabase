import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Sidesheet } from "metabase/common/components/Sidesheet";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableFieldOrder, TableId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { FieldOrderPicker } from "./FieldOrderPicker";
import { SortableField } from "./SortableField";
import { getId, getItems, getItemsOrder, sortItems } from "./lib";

/**
 * This is to prevent FieldOrderPicker's focus state outline being cut off.
 * Mantine Button's outline-width is 2px.
 */
const BUTTON_OUTLINE_WIDTH = 2;

type OrderItemId = string | number;

interface OwnProps {
  tableId: TableId;
  isOpen: boolean;
  onClose: () => void;
}

interface Props extends OwnProps {
  error: unknown;
  loading: boolean;
  table?: Table;
}

const FieldOrderSidesheetBase = ({
  error,
  isOpen,
  loading,
  table,
  onClose,
}: Props) => {
  const dispatch = useDispatch();
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const items = useMemo(() => getItems(table?.fields), [table?.fields]);
  const [customOrder, setCustomOrder] = useState<OrderItemId[] | null>(null);
  const order = useMemo(
    () => customOrder ?? getItemsOrder(items),
    [customOrder, items],
  );
  const sortedItems = useMemo(() => sortItems(items, order), [items, order]);
  const isDragDisabled = sortedItems.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    setCustomOrder(itemIds);
    dispatch(Tables.actions.setFieldOrder(table, itemIds));
  };

  const handleFieldOrderChange = (value: TableFieldOrder) => {
    dispatch(Tables.actions.updateProperty(table, "field_order", value));
  };

  if (loading || error || !table) {
    return (
      <Sidesheet isOpen={isOpen} title={t`Edit column order`} onClose={onClose}>
        <LoadingAndErrorWrapper error={error} loading={loading} />
      </Sidesheet>
    );
  }

  return (
    <Sidesheet isOpen={isOpen} title={t`Edit column order`} onClose={onClose}>
      <Flex direction="column" gap="sm">
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
            items={sortedItems}
            renderItem={({ item, id }) => (
              <SortableField
                disabled={isDragDisabled}
                icon={item.icon}
                id={id}
                key={id}
                label={item.label}
              />
            )}
            sensors={[pointerSensor]}
            onSortEnd={handleSortEnd}
          />
        </Flex>
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
    loadingAndErrorWrapper: false,
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
    selectorName: "getObjectUnfiltered",
  }),
)(FieldOrderSidesheetBase);
