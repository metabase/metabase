import React from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import { normal } from "metabase/lib/colors";

const LandingNav = props => {
  return (
    <Box>
      <Flex>
        <Box flex={1} bg={normal.green} color="white">
          <Icon name="insight" />
          <Link to="metrics">Metrics</Link>
        </Box>
        <Box flex={1} bg={normal.indigo} color="white">
          <Icon name="segment" />
          <Link to="segments">Segments</Link>
        </Box>
        <Box flex={1} bg={normal.grey1}>
          <Flex>
            <Link to="questions">Questions</Link>
          </Flex>
        </Box>
        <Box flex={1} bg={normal.blue}>
          <Link to="metrics">Metrics</Link>
        </Box>
      </Flex>
    </Box>
  );
};

export default LandingNav;
