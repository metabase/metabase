/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { ItemContent, ExpandItemIcon, ItemRoot } from "./Item.styled";

const Item = ({
  item,
  name,
  icon,
  color,
  selected,
  canSelect,
  hasChildren,
  onChange,
  onChangeParentId,
}) => {
  const iconProps = _.isObject(icon) ? icon : { name: icon };
  return (
    <ItemRoot
      mt={1}
      p={1}
      onClick={
        canSelect
          ? () => onChange(item)
          : hasChildren
          ? () => onChangeParentId(item.id)
          : null
      }
      canSelect={canSelect}
      isSelected={selected}
      hasChildren={hasChildren}
      data-testid="item-picker-item"
    >
      <ItemContent>
        <Icon size={22} {...iconProps} color={selected ? "white" : color} />
        <h4 className="mx1">{name}</h4>
        {hasChildren && (
          <ExpandItemIcon
            name="chevronright"
            canSelect={canSelect}
            onClick={e => {
              e.stopPropagation();
              onChangeParentId(item.id);
            }}
          />
        )}
      </ItemContent>
    </ItemRoot>
  );
};

export default Item;
