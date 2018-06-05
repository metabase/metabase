import React from "react";
import { t } from "c-3po";
import EntityMenu from "metabase/components/EntityMenu";

import { Flex, Box, Truncate } from "rebass";

import CheckBox from "metabase/components/CheckBox";
import Icon from "metabase/components/Icon";

import { normal } from "metabase/lib/colors";

const EntityItemWrapper = Flex.extend`
  border-bottom: 1px solid #f8f9fa;
  /* TODO - figure out how to use the prop instead of this? */
  align-items: center;
  &:hover {
    color: ${normal.blue};
  }
  &:last-child {
    border-bottom: none;
  }
`;

const IconWrapper = Flex.extend`
  background: #f4f5f6;
  border-radius: 6px;
`;

const EntityItem = ({
  name,
  iconName,
  iconColor,
  item,
  onPin,
  selected,
  onToggleSelected,
}) => {
  return (
    <EntityItemWrapper py={2} px={2} className="hover-parent hover--visibility">
      <IconWrapper
        p={1}
        mr={1}
        align="center"
        justify="center"
        className="hover-parent hover--visibility"
      >
        <CheckBox
          checked={selected}
          onChange={onToggleSelected}
          className="hover-child"
        />
        <Icon name={iconName} color={iconColor} />
      </IconWrapper>
      <h3>
        <Truncate>{name}</Truncate>
      </h3>

      <Flex
        ml="auto"
        align="center"
        className="hover-child"
        onClick={e => e.preventDefault()}
      >
        <Icon
          name="staroutline"
          mr={1}
          onClick={() => item.setFavorited(item)}
        />
        <EntityMenu
          triggerIcon="ellipsis"
          items={[
            {
              title: t`Pin this item`,
              icon: "pin",
              action: () => onPin(item),
            },
            {
              title: t`Move this item`,
              icon: "move",
              action: () => onPin(item),
            },
            {
              title: t`Archive`,
              icon: "archive",
              action: () => item.setArchived(item),
            },
          ]}
        />
      </Flex>
    </EntityItemWrapper>
  );
};

export default EntityItem;
