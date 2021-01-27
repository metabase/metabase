import React from "react";
import { Box, Flex } from "grid-styled";

import Database from "metabase/entities/databases";

import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

function DatabaseBrowser({ databases }) {
  return (
    <Box w={300} bg="white" p={4} className="border-right">
      {databases.map(database => (
        <Link
          key={database.id}
          to={`browse/${database.id}`}
          data-metabase-event={`${ANALYTICS_CONTEXT};Database Click`}
          display="block"
          mb={3}
          hover={{ color: color("brand") }}
        >
          <Flex align="center">
            <Icon name="database" size={18} mr={1} />
            <h3 className="text-wrap">{database.name}</h3>
          </Flex>
        </Link>
      ))}
    </Box>
  );
}

export default Database.loadList()(DatabaseBrowser);
