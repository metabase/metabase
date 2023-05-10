import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import Icon, { IconProps } from "metabase/components/Icon";

import type { PickerItem, PickerItemId } from "./types";

import { ItemRoot, ItemContent, ItemTitle, ExpandButton } from "./Item.styled";

interface Props {
  item: PickerItem;
  name: string;
  icon: string | IconProps;
  color: string;
  selected: boolean;
  canSelect: boolean;
  hasChildren?: boolean;
  onChange: (item: PickerItem) => void;
  onChangeOpenCollectionId?: (id: PickerItemId) => void;
}

function Item({
  item,
  name,
  icon,
  color,
  selected,
  canSelect,
  hasChildren,
  onChange,
  onChangeOpenCollectionId,
}: Props) {
  const handleClick = useMemo(() => {
    if (canSelect) {
      return () => onChange(item);
    }
    if (hasChildren) {
      return () => onChangeOpenCollectionId?.(item.id);
    }
    return;
  }, [item, canSelect, hasChildren, onChange, onChangeOpenCollectionId]);

  const handleExpand = useCallback(
    event => {
      event.stopPropagation();
      onChangeOpenCollectionId?.(item.id);
    },
    [item, onChangeOpenCollectionId],
  );

  const iconProps = useMemo(
    () => (_.isObject(icon) ? icon : { name: icon }),
    [icon],
  );

  return (
    <ItemRoot
      onClick={handleClick}
      canSelect={canSelect}
      isSelected={selected}
      hasChildren={hasChildren}
      data-testid="item-picker-item"
    >
      <ItemContent>
        <Icon size={22} {...iconProps} color={selected ? "white" : color} />
        <ItemTitle>{name}</ItemTitle>
        {hasChildren && (
          <ExpandButton
            canSelect={canSelect}
            onClick={handleExpand}
            data-testid="expand-btn"
          >
            <Icon name="chevronright" />
          </ExpandButton>
        )}
      </ItemContent>
    </ItemRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Item;
