import React from "react";
import PropTypes from "prop-types";
import { BannerRoot } from "metabase/components/Banner/Banner.styled";

const propTypes = {
  children: PropTypes.node,
};

const Banner = ({ children }) => {
  return <BannerRoot>{children}</BannerRoot>;
};

Banner.propTypes = propTypes;

export default Banner;
