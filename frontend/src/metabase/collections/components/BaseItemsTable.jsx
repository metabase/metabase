import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import BaseTableItem from "./BaseTableItem";

BaseItemsTable.Item = BaseTableItem;

BaseItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object),
  collection: PropTypes.object,
  isPinned: PropTypes.bool,
  renderItem: PropTypes.func,
  onToggleSelected: PropTypes.func,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  getIsSelected: PropTypes.func,
};

function defaultItemRenderer({ item, ...props }) {
  return (
    <BaseTableItem key={`${item.model}-${item.id}`} item={item} {...props} />
  );
}

function BaseItemsTable({
  items,
  collection = {},
  isPinned,
  renderItem = defaultItemRenderer,
  onCopy,
  onMove,
  onToggleSelected,
  getIsSelected = () => false,
  ...props
}) {
  const itemRenderer = item =>
    renderItem({
      item,
      collection,
      isSelected: getIsSelected(item),
      isPinned,
      onCopy,
      onMove,
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
      <thead>
        <tr>
          <th className="text-centered">{t`Type`}</th>
          <th>{t`Name`}</th>
          <th>{t`Last edited by`}</th>
          <th>{t`Last edited at`}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>{items.map(itemRenderer)}</tbody>
    </table>
  );
}

export default BaseItemsTable;
