import React from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import { normal } from "metabase/lib/colors";

const ICON_SIZE = 42

const LandingNav = props => {
  return (
    <Box>
      <Flex>
        <Box flex={1} bg={normal.green} color="white">
          <Flex align='center' justify='center' style={{ height: 120 }} direction='column'>
            <Icon name="insight" size={ICON_SIZE} />
            <Link to="metrics">Metrics</Link>
          </Flex>
        </Box>
        <Box flex={1} bg={normal.indigo} color="white">
          <Flex align='center' justify='center' style={{ height: 120 }} direction='column'>
            <Icon name="segment" size={ICON_SIZE} />
            <Link to="segments">Segments</Link>
          </Flex>
        </Box>
        <Box flex={1} bg={normal.blue} color="white">
          <Flex align='center' justify='center' style={{ height: 120 }} direction='column'>
            <Icon name="dashboard" size={ICON_SIZE} />
            <Link to="dashboards">Dashboards</Link>
          </Flex>
        </Box>
        <Box flex={1} bg={normal.grey1}>
          <Flex align='center' justify='center' style={{ height: 120 }} direction='column'>
            <Link to="questions">Questions</Link>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
};

export default LandingNav;
