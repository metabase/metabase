import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useDeepCompareEffect } from "react-use";
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

interface OwnProps {
  tableId: TableId;
  isOpen: boolean;
  onClose: () => void;
}

interface Props extends OwnProps {
  error: unknown;
  fetched: boolean;
  table?: Table;
}

const FieldOrderSidesheetBase = ({
  error,
  fetched,
  isOpen,
  table,
  onClose,
}: Props) => {
  const dispatch = useDispatch();
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const initialItems = useMemo(() => getItems(table?.fields), [table?.fields]);
  const initialOrder = useMemo(
    () => getItemsOrder(initialItems),
    [initialItems],
  );
  const [items, setItems] = useState(initialItems);
  const [order, setOrder] = useState(initialOrder);
  const sortedItems = useMemo(() => sortItems(items, order), [items, order]);
  const isDragDisabled = sortedItems.length <= 1;
  const isLoading = !fetched; // matches condition from EntityObjectLoader

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    setOrder(itemIds);
    dispatch(Tables.actions.setFieldOrder(table, itemIds));
  };

  const handleFieldOrderChange = (value: TableFieldOrder) => {
    dispatch(Tables.actions.updateProperty(table, "field_order", value));
  };

  /**
   * Right after performing drag and drop the items would shortly flicker back to the original order,
   * and then back to the new one. These deep compare effects help avoid this flicker.
   *
   * Fields are mapped to items because using a field as a dep here results in an infinite loop.
   */
  useDeepCompareEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  useDeepCompareEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  if (isLoading || error || !table) {
    return (
      <Sidesheet isOpen={isOpen} title={t`Edit column order`} onClose={onClose}>
        <LoadingAndErrorWrapper error={error} loading={isLoading} />
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
