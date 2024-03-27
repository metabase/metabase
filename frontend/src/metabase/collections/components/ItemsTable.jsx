import PropTypes from "prop-types";

import PinDropZone from "metabase/collections/components/PinDropZone";
import CS from "metabase/css/core/index.css";

import BaseItemsTable from "./BaseItemsTable";
import { ItemsTableRoot } from "./ItemsTable.styled";

Item.propTypes = {
  item: PropTypes.object.isRequired,
};

function Item({ item, ...props }) {
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
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
    <div className={CS.relative}>
      <PinDropZone variant="unpin" />
      <BaseItemsTable {...props} renderItem={Item} />
    </div>
  );
}

export default ItemsTable;
