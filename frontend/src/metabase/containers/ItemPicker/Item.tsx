import { useCallback, useMemo } from "react";
import _ from "underscore";

import type { IconName, IconProps } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";

import type { PickerItem } from "./types";

import { ItemRoot, ItemContent, ItemTitle, ExpandButton } from "./Item.styled";

interface Props<TId> {
  item: PickerItem<TId>;
  name: string;
  icon: IconName | IconProps;
  selected: boolean;
  canSelect: boolean;
  hasChildren?: boolean;
  onChange: (item: PickerItem<TId>) => void;
  onChangeOpenCollectionId?: (id: TId) => void;
}

function Item<TId>({
  item,
  name,
  icon,
  selected,
  canSelect,
  hasChildren,
  onChange,
  onChangeOpenCollectionId,
}: Props<TId>) {
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
      aria-selected={selected}
      role="option"
    >
      <ItemContent>
        <Icon {...iconProps} />
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
