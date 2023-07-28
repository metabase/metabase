import PropTypes from "prop-types";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import PinDropZone from "metabase/collections/components/PinDropZone";

import BaseItemsTable from "./BaseItemsTable";
import { ItemsTableRoot } from "./ItemsTable.styled";

Item.propTypes = {
  item: PropTypes.object.isRequired,
};

function Item({ item, ...props }) {
  const metabaseEvent = `${ANALYTICS_CONTEXT};Item Click;${item.model}`;
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
      linkProps={{
        "data-metabase-event": metabaseEvent,
      }}
    />
  );
}

ItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function ItemsTable(props) {
  const { items } = props;

  if (items.length === 0) {
    return (
      <ItemsTableRoot>
        <PinDropZone variant="unpin" />
      </ItemsTableRoot>
    );
  }

  return (
    <div className="relative">
      <PinDropZone variant="unpin" />
      <BaseItemsTable {...props} renderItem={Item} />
    </div>
  );
}

export default ItemsTable;
