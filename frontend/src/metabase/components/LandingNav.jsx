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
  const { collectionId } = props;

  function showEntity(type) {
    return {
      pathname: collectionId ? `collection/${collectionId}` : "",
      query: { show: type },
    };
  }

  return (
    <Box className="absolute left top" px={2} pt={1}>
      <Box>
        <Link to={showEntity()} style={linkStyle} activeStyle={activeStyle}>
          <Icon name="reference" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link
          to={showEntity("dashboards")}
          style={linkStyle}
          activeStyle={activeStyle}
          className="text-brand-hover"
        >
          <Icon name="dashboard" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link
          to={showEntity("pulses")}
          style={linkStyle}
          activeStyle={activeStyle}
          className="text-brand-hover"
        >
          <Icon name="pulse" size={ICON_SIZE} />
        </Link>
      </Box>
      <Box>
        <Link
          to={showEntity("questions")}
          activeStyle={activeStyle}
          style={linkStyle}
          className="text-brand-hover"
        >
          <Icon name="beaker" size={ICON_SIZE} />
        </Link>
      </Box>
    </Box>
  );
};

export default LandingNav;
