import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import moment from "moment";

import EntityItem from "metabase/components/EntityItem";

import { ItemLink, TableItemSecondaryField } from "./BaseItemsTable.styled";

BaseTableItem.propTypes = {
  item: PropTypes.object,
  isPinned: PropTypes.bool,
  linkProps: PropTypes.object,
};

export function BaseTableItem({ item, isPinned, linkProps = {} }) {
  const lastEditInfo = item["last-edit-info"];
  const lastEditedBy = `${lastEditInfo.first_name} ${lastEditInfo.last_name}`;
  const lastEditedAt = moment(lastEditInfo.timestamp).format("MMMM DD, YYYY");

  return (
    <tr key={item.id}>
      <td>
        <EntityItem.Icon
          item={item}
          variant="list"
          iconName={item.getIcon()}
          pinned={isPinned}
        />
      </td>
      <td>
        <ItemLink {...linkProps} to={item.getUrl()}>
          <EntityItem.Name name={item.name} />
        </ItemLink>
      </td>
      <td>
        <TableItemSecondaryField>{lastEditedBy}</TableItemSecondaryField>
      </td>
      <td>
        <TableItemSecondaryField>{lastEditedAt}</TableItemSecondaryField>
      </td>
      <td></td>
    </tr>
  );
}

BaseItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object),
  isPinned: PropTypes.bool,
  renderItem: PropTypes.func,
};

function defaultItemRenderer({ item, ...props }) {
  return (
    <BaseTableItem key={`${item.model}-${item.id}`} item={item} {...props} />
  );
}

function BaseItemsTable({ items, isPinned, renderItem = defaultItemRenderer }) {
  const itemRenderer = useCallback(
    item =>
      renderItem({
        item,
        isPinned,
      }),
    [isPinned, renderItem],
  );

  return (
    <table className="ContentTable">
      <colgroup>
        <col span="type" style={{ width: "5%" }} />
        <col span="name" style={{ width: "55%" }} />
        <col span="last-edited-by" style={{ width: "15%" }} />
        <col span="last-edited-at" style={{ width: "20%" }} />
        <col span="actions" style={{ width: "5%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>{t`Type`}</th>
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
