/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import {
  ItemRoot,
  ItemContent,
  ItemTitle,
  ExpandItemIcon,
} from "./Item.styled";

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
        <ItemTitle>{name}</ItemTitle>
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
