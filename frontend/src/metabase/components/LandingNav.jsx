import React from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

const ICON_SIZE = 18;

const LandingNav = props => {
  return (
    <Box>
      <Flex>
        <Flex align="center">
          <Icon name="insight" size={ICON_SIZE} className="mr1" />
          <Link to="reference">Guide</Link>
        </Flex>
        <Flex align="center">
          <Icon name="insight" size={ICON_SIZE} className="mr1" />
          <Link to="metrics">Metrics</Link>
        </Flex>
        <Flex align="center">
          <Icon name="segment" size={ICON_SIZE} className="mr1" />
          <Link to="segments">Segments</Link>
        </Flex>
        <Flex align="center">
          <Icon name="dashboard" size={ICON_SIZE} className="mr1" />
          <Link to="dashboards">Dashboards</Link>
        </Flex>
        <Flex align="center">
          <Icon name="explore" size={ICON_SIZE} className="mr1" />
          <Link to="questions">Questions</Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default LandingNav;
