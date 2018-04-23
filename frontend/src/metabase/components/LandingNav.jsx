import React from "react";
import { Box } from "rebass";
import { Link } from "react-router";

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

  function showEntity(type) {
    return `${
      collectionSlug ? `collections/${collectionSlug}` : ""
    }?show=${type}`;
  }

  return (
    <Box className="absolute left top" px={2}>
      <Box>
        <Link
          to={collectionSlug ? `collections/${collectionSlug}` : "/"}
          style={linkStyle}
          activeStyle={activeStyle}
        >
          <Icon name="reference" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link
          to={showEntity("dashboards")}
          style={linkStyle}
          activeStyle={activeStyle}
        >
          <Icon name="dashboard" size={ICON_SIZE} />
        </Link>
      </Box>
      {/*
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
      */}
      <Box>
        <Link
          to={showEntity("pulses")}
          style={linkStyle}
          activeStyle={activeStyle}
        >
          <Icon name="pulse" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link
          to={showEntity("questions")}
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
