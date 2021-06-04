import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import moment from "moment";

import EntityItem from "metabase/components/EntityItem";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import {
  ItemLink,
  TableRow,
  TableItemSecondaryField,
} from "./BaseItemsTable.styled";

BaseTableItem.propTypes = {
  item: PropTypes.object,
  collection: PropTypes.object,
  isSelected: PropTypes.bool,
  isPinned: PropTypes.bool,
  linkProps: PropTypes.object,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onToggleSelected: PropTypes.func,
};

export function BaseTableItem({
  item,
  collection = {},
  isSelected,
  isPinned,
  linkProps = {},
  onCopy,
  onMove,
  onToggleSelected,
}) {
  const canSelect = typeof onToggleSelected === "function";

  const lastEditInfo = item["last-edit-info"];

  // We don't keep last edit info for pulses
  // TODO Remove ternary when Pulses are gone
  const lastEditedBy = lastEditInfo
    ? `${lastEditInfo.first_name} ${lastEditInfo.last_name}`
    : "";
  const lastEditedAt = lastEditInfo
    ? moment(lastEditInfo.timestamp).format("MMMM DD, YYYY")
    : "";

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const handlePin = useCallback(() => {
    item.setPinned(!isPinned);
  }, [item, isPinned]);

  const handleMove = useCallback(() => onMove([item]), [item, onMove]);
  const handleCopy = useCallback(() => onCopy([item]), [item, onCopy]);
  const handleArchive = useCallback(() => item.setArchived(true), [item]);

  const testId = isPinned ? "pinned-collection-entry" : "collection-entry";

  return (
    <TableRow key={item.id} data-testid={testId}>
      <td>
        <EntityItem.Icon
          item={item}
          variant="list"
          iconName={item.getIcon()}
          pinned={isPinned}
          selectable={canSelect}
          selected={isSelected}
          onToggleSelected={handleSelectionToggled}
          height="3em"
          width="3em"
          mr={0}
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
    </TableRow>
  );
}

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
  const itemRenderer = useCallback(
    item =>
      renderItem({
        item,
        collection,
        isSelected: getIsSelected(item),
        isPinned,
        onCopy,
        onMove,
        onToggleSelected,
      }),
    [
      collection,
      isPinned,
      onCopy,
      onMove,
      onToggleSelected,
      renderItem,
      getIsSelected,
    ],
  );

  return (
    <table className="ContentTable" {...props}>
      <colgroup>
        <col span="type" style={{ width: "5%" }} />
        <col span="name" style={{ width: "55%" }} />
        <col span="last-edited-by" style={{ width: "15%" }} />
        <col span="last-edited-at" style={{ width: "20%" }} />
        <col span="actions" style={{ width: "5%" }} />
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
