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
    <tr>
      <td>
        <EntityItem.Icon
          item={item}
          variant="list"
          iconName={item.getIcon()}
          pinned
          onToggleSelected={onToggleSelected}
          height="3em"
          width="3em"
        />
      </td>
      <td>
        <EntityItem.Name name={item.name} />
      </td>
      <td>
        <p className="text-dark text-bold">{lastEditedBy}</p>
      </td>
      <td>
        <p className="text-dark text-bold">{lastEditedAt}</p>
      </td>
    </tr>
  );
}

function PinnedItemsTable({ items, onToggleSelected }) {
  const renderItem = useCallback(
    item => (
      <PinnedItem
        key={`${item.model}-${item.id}`}
        item={item}
        onToggleSelected={onToggleSelected}
      />
    ),
    [onToggleSelected],
  );

  return (
    <table className="ContentTable">
      <colgroup>
        <col span="1" style={{ width: "5%" }} />
        <col span="1" style={{ width: "60%" }} />
        <col span="1" style={{ width: "15%" }} />
        <col span="1" style={{ width: "20%" }} />
      </colgroup>
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
