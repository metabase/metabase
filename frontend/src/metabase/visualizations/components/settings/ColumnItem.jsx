import React from "react";

import Icon from "metabase/components/Icon";

import cx from "classnames";

const ActionIcon = ({ icon, onClick }) => (
  <Icon
    name={icon}
    className="cursor-pointer text-light text-medium-hover ml1"
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
  />
);

const ColumnItem = ({ title, onAdd, onRemove, onClick, onEdit, draggable }) => (
  <div
    className={cx("my1 bordered rounded overflow-hidden bg-white", {
      "cursor-grab shadowed": draggable,
      "cursor-pointer": onClick,
    })}
    onClick={onClick}
  >
    <div className="p1 border-bottom relative">
      <div className="px1 flex align-center relative">
        <span className="h4 flex-full text-dark">{title}</span>
        {onEdit && <ActionIcon icon="gear" onClick={onEdit} />}
        {onAdd && <ActionIcon icon="add" onClick={onAdd} />}
        {onRemove && <ActionIcon icon="close" onClick={onRemove} />}
      </div>
    </div>
  </div>
);

export default ColumnItem;
