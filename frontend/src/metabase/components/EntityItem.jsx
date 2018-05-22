import React from "react";

import { Flex, Box, Truncate } from "rebass";
import Icon from "metabase/components/Icon";

import { normal } from "metabase/lib/colors";

const EntityItemWrapper = Flex.extend`
  border-bottom: 1px solid #f8f9fa;
  /* TODO - figure out how to use the prop instead of this? */
  align-items: center;
  &:hover {
    color: ${normal.blue};
  }
`;

const IconWrapper = Flex.extend`
  background: #f4f5f6;
  border-radius: 6px;
`;

const EntityItem = ({ name, iconName, iconColor, item, onPin }) => {
  return (
    <EntityItemWrapper py={2} px={2} className="hover-parent hover--visibility">
      <IconWrapper p={1} mr={1} align="center" justify="center">
        <Icon name={iconName} color={iconColor} />
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
          <Icon name="star" />
        </Box>
      )}
    </EntityItemWrapper>
  );
};

export default EntityItem;
