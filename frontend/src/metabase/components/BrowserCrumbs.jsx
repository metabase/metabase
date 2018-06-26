import React from "react";
import { Box, Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";

// TODO: merge with Breadcrumbs

const BrowseHeader = ({ children }) => <Subhead>{children}</Subhead>;

const BrowserCrumbs = ({ crumbs }) => (
  <Box>
    {crumbs.filter(c => c).map((crumb, index, crumbs) => [
      crumb.to ? (
        <Flex align="center">
          <Link key={"title" + index} to={crumb.to}>
            {crumb.title}
          </Link>
          {index < crumbs.length - 1 ? (
            <Icon key={"divider" + index} name="chevronright" mx={1} />
          ) : null}
        </Flex>
      ) : (
        <Box>
          <BrowseHeader>{crumb.title}</BrowseHeader>
        </Box>
      ),
    ])}
  </Box>
);

export default BrowserCrumbs;
