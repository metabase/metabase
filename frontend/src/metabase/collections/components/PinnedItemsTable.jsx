/* eslint-disable react/prop-types */
/* eslint-disable react/jsx-key */
import React, { useCallback } from "react";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import moment from "moment";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

function PinnedItem({ item, onToggleSelected, getIsSelected }) {
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
          selectable
          selected={getIsSelected(item)}
          onToggleSelected={() => {
            onToggleSelected(item);
          }}
          height="3em"
          width="3em"
        />
      </td>
      <td>
        <Link
          to={item.getUrl()}
          className="hover-parent hover--visibility"
          hover={{ color: color("brand") }}
          data-metabase-event={`${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`}
        >
          <EntityItem.Name name={item.name} />
        </Link>
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

function PinnedItemsTable({ items, onToggleSelected, getIsSelected }) {
  const renderItem = useCallback(
    item => (
      <PinnedItem
        key={`${item.model}-${item.id}`}
        item={item}
        onToggleSelected={onToggleSelected}
        getIsSelected={getIsSelected}
      />
    ),
    [onToggleSelected, getIsSelected],
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
