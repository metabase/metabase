import React from "react";

import { Flex, Box, Truncate } from "rebass";

import CheckBox from "metabase/components/CheckBox"
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

const EntityItem = ({ name, iconName, iconColor, item, onPin, selected, onToggleSelected }) => {
  return (
    <EntityItemWrapper py={2} px={2} className="hover-parent hover--visibility">
      <IconWrapper p={1} mr={1} align="center" justify="center" className="hover-parent hover--visibility">
        <Icon name={iconName} color={iconColor} />
        <CheckBox checked={selected} onChange={onToggleSelected} className="hover-child" />
      </IconWrapper>
      <h3>
        <Truncate>{name}</Truncate>
      </h3>

      {onPin && (
        <Box
          className="hover-child"
          ml="auto"
          onClick={e => {
            e.preventDefault();
            onPin(item);
          }}
        >
          <Icon name="pin" />
        </Box>
      )}
    </EntityItemWrapper>
  );
};

export default EntityItem;
