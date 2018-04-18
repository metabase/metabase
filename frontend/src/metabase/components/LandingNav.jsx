import React from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";

import { normal } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

const activeStyle = {
  backgroundColor: normal.blue,
  color: "white",
};

const linkStyle = {
  padding: "1em",
  borderRadius: 6,
  display: "block",
  color: "#93A1AB",
};

const ICON_SIZE = 18;

const LandingNav = props => {
  const { collectionSlug } = props;
  return (
    <Box className="absolute left top" px={2}>
      <Box>
        <Link to="/" style={linkStyle} activeStyle={activeStyle}>
          <Icon name="reference" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="dashboards" style={linkStyle} activeStyle={activeStyle}>
          <Icon name="dashboard" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="metrics" style={linkStyle} activeStyle={activeStyle}>
          <Icon name="insight" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="segments" style={linkStyle} activeStyle={activeStyle}>
          <Icon name="segment" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link to="pulse" style={linkStyle} activeStyle={activeStyle}>
          <Icon name="pulse" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link
          to={
            collectionSlug
              ? Urls.collection({ slug: collectionSlug })
              : "questions"
          }
          activeStyle={activeStyle}
          style={linkStyle}
        >
          <Icon name="beaker" size={ICON_SIZE} />
        </Link>
      </Box>
    </Box>
  );
};

export default LandingNav;
