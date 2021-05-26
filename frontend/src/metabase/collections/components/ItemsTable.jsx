/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import moment from "moment";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

function TableItem({
  item,
  collection,
  pinned,
  onCopy,
  onMove,
  onToggleSelected,
  getIsSelected,
  getLinkProps,
}) {
  const lastEditInfo = item["last-edit-info"];
  const lastEditedBy = `${lastEditInfo.first_name} ${lastEditInfo.last_name}`;
  const lastEditedAt = moment(lastEditInfo.timestamp).format("MMMM DD, YYYY");

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const handlePin = useCallback(() => {
    item.setPinned(!pinned);
  }, [item, pinned]);

  const handleMove = useCallback(() => onMove([item]), [item, onMove]);
  const handleCopy = useCallback(() => onCopy([item]), [item, onCopy]);
  const handleArchive = useCallback(() => item.setArchived(true), [item]);

  return (
    <tr>
      <td>
        <EntityItem.Icon
          item={item}
          variant="list"
          iconName={item.getIcon()}
          pinned={pinned}
          selectable
          selected={getIsSelected(item)}
          onToggleSelected={handleSelectionToggled}
          height="3em"
          width="3em"
          mr={0}
        />
      </td>
      <td>
        <Link {...getLinkProps(item)} to={item.getUrl()}>
          <EntityItem.Name name={item.name} />
        </Link>
      </td>
      <td>
        <p className="text-dark text-bold">{lastEditedBy}</p>
      </td>
      <td>
        <p className="text-dark text-bold">{lastEditedAt}</p>
      </td>
      <td>
        <EntityItem.Menu
          item={item}
          onPin={collection.can_write ? handlePin : null}
          onMove={
            collection.can_write && item.setCollection ? handleMove : null
          }
          onCopy={item.copy ? handleCopy : null}
          onArchive={
            collection.can_write && item.setArchived ? handleArchive : null
          }
          ANALYTICS_CONTEXT={ANALYTICS_CONTEXT}
        />
      </td>
    </tr>
  );
}

const defaultProps = {
  collection: {},
  getLinkProps: item => ({
    "data-metabase-event": `${ANALYTICS_CONTEXT};Item Click;${item.model}`,
  }),
};

function ItemsTable({
  items,
  pinned,
  collection,
  onCopy,
  onMove,
  onToggleSelected,
  getIsSelected,
  getLinkProps,
}) {
  const renderItem = useCallback(
    item => (
      <TableItem
        key={`${item.model}-${item.id}`}
        item={item}
        pinned={pinned}
        collection={collection}
        onCopy={onCopy}
        onMove={onMove}
        onToggleSelected={onToggleSelected}
        getIsSelected={getIsSelected}
        getLinkProps={getLinkProps}
      />
    ),
    [
      collection,
      pinned,
      onCopy,
      onMove,
      onToggleSelected,
      getLinkProps,
      getIsSelected,
    ],
  );

  return (
    <table className="ContentTable">
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
      <tbody>{items.map(renderItem)}</tbody>
    </table>
  );
}

ItemsTable.defaultProps = defaultProps;

export default ItemsTable;
