import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import BaseTableItem from "./BaseTableItem";

BaseItemsTable.Item = BaseTableItem;

BaseItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object),
  collection: PropTypes.object,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  isPinned: PropTypes.bool,
  renderItem: PropTypes.func,
  onToggleSelected: PropTypes.func,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onDrop: PropTypes.func,
  getIsSelected: PropTypes.func,

  // Used for dragging
  headless: PropTypes.bool,
};

function defaultItemRenderer({ item, ...props }) {
  return (
    <BaseTableItem.Item
      key={`${item.model}-${item.id}`}
      item={item}
      {...props}
    />
  );
}

function BaseItemsTable({
  items,
  collection = {},
  selectedItems,
  isPinned,
  renderItem = defaultItemRenderer,
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
  getIsSelected = () => false,
  headless = false,
  ...props
}) {
  const itemRenderer = item =>
    renderItem({
      item,
      collection,
      selectedItems,
      isSelected: getIsSelected(item),
      isPinned,
      onCopy,
      onMove,
      onDrop,
      onToggleSelected,
    });

  return (
    <table className="ContentTable" {...props}>
      <colgroup>
        <col span="1" style={{ width: "5%" }} />
        <col span="1" style={{ width: "55%" }} />
        <col span="1" style={{ width: "15%" }} />
        <col span="1" style={{ width: "20%" }} />
        <col span="1" style={{ width: "5%" }} />
      </colgroup>
      {!headless && (
        <thead>
          <tr>
            <th className="text-centered">{t`Type`}</th>
            <th>{t`Name`}</th>
            <th>{t`Last edited by`}</th>
            <th>{t`Last edited at`}</th>
            <th></th>
          </tr>
        </thead>
      )}
      <tbody>{items.map(itemRenderer)}</tbody>
    </table>
  );
}

export default BaseItemsTable;
