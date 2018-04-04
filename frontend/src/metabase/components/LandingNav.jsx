import React from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import * as Urls from 'metabase/lib/urls'

import Icon from "metabase/components/Icon";

const ICON_SIZE = 18;

const LandingNav = props => {
  const { collectionSlug } = props
  return (
    <Box className="absolute left" px={2}>
      <Box>
        <Link to="/">
          <Icon name="reference" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="dashboards">
          <Icon name="dashboard" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="metrics">
          <Icon name="insight" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="segments">
          <Icon name="segment" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to={ collectionSlug ? Urls.collection({ slug: collectionSlug }) : "questions"}>
          <Icon name="add" size={ICON_SIZE} />
        </Link>
      </Box>
    </Box>
  );
};

export default LandingNav;
