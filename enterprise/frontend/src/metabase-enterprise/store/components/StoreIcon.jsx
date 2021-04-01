/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import colors from "metabase/lib/colors";

const ICON_SIZE = 22;
const WRAPPER_SIZE = ICON_SIZE * 2.5;

const StoreIconWrapper = ({ children, color }) => (
  <Flex
    align="center"
    justify="center"
    p={2}
    bg={color || colors["brand"]}
    color="white"
    w={WRAPPER_SIZE}
    style={{ borderRadius: 99, height: WRAPPER_SIZE }}
  >
    {children}
  </Flex>
);

const StoreIcon = ({ color, name, ...props }) => (
  <StoreIconWrapper color={color}>
    <Icon name={name} size={ICON_SIZE} />
  </StoreIconWrapper>
);

export default StoreIcon;
