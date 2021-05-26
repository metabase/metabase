/* eslint-disable react/prop-types */
/* eslint-disable react/jsx-key */
import React, { useCallback } from "react";
import { t } from "ttag";
import moment from "moment";

import EntityItem from "metabase/components/EntityItem";

function PinnedItem({ item, onToggleSelected }) {
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
          pinned
          onToggleSelected={onToggleSelected}
        />
      </td>
      <td>
        <p>{item.name}</p>
      </td>
      <td>
        <p>{lastEditedBy}</p>
      </td>
      <td>
        <p>{lastEditedAt}</p>
      </td>
    </tr>
  );
}

function PinnedItemsTable({ items, onToggleSelected }) {
  const renderItem = useCallback(
    item => <PinnedItem item={item} onToggleSelected={onToggleSelected} />,
    [onToggleSelected],
  );

  return (
    <table>
      <thead>
        <tr>
          <th>{t`Type`}</th>
          <th>{t`Name`}</th>
          <th>{t`Last edited by`}</th>
          <th>{t`Last edited at`}</th>
        </tr>
      </thead>
      <tbody>{items.map(renderItem)}</tbody>
    </table>
  );
}

export default PinnedItemsTable;
