import React from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import * as Urls from 'metabase/lib/urls'

import Icon from "metabase/components/Icon";

const ICON_SIZE = 18;

const LandingNav = props => {
  const { collectionSlug } = props
  return (
    <Box>
      <Flex>
        <Flex align="center" mr={1}>
          <Icon name="reference" size={ICON_SIZE} className="mr1" />
          <Link to="/">Guide</Link>
        </Flex>
        <Flex align="center" mr={1}>
          <Icon name="dashboard" size={ICON_SIZE} className="mr1" />
          <Link to="dashboards">Dashboards</Link>
        </Flex>
        <Flex align="center" mr={1}>
          <Icon name="insight" size={ICON_SIZE} className="mr1" />
          <Link to="metrics">Metrics</Link>
        </Flex>
        <Flex align="center" mr={1}>
          <Icon name="segment" size={ICON_SIZE} className="mr1" />
          <Link to="segments">Segments</Link>
        </Flex>
        <Flex align="center" mr={1}>
          <Icon name="explore" size={ICON_SIZE} className="mr1" />
          <Link to={ collectionSlug ? Urls.collection({ slug: collectionSlug }) : "questions"}>
            Questions
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default LandingNav;
