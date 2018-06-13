import React from "react";
import { Box, Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";

// TODO: merge with Breadcrumbs

const BrowseHeader = ({ children }) => (
  <Box my={3}>
    <Subhead>{children}</Subhead>
  </Box>
);

const BrowserCrumbs = ({ crumbs }) => (
  <Flex align="center">
    {crumbs.filter(c => c).map((crumb, index, crumbs) => [
      crumb.to ? (
        <Link key={"title" + index} to={crumb.to}>
          <BrowseHeader>{crumb.title}</BrowseHeader>
        </Link>
      ) : (
        <BrowseHeader>{crumb.title}</BrowseHeader>
      ),
      index < crumbs.length - 1 ? (
        <Icon key={"divider" + index} name="chevronright" mx={2} />
      ) : null,
    ])}
  </Flex>
);

export default BrowserCrumbs;
