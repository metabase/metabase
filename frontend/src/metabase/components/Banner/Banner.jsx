import React from "react";
import PropTypes from "prop-types";
import { BannerRoot } from "metabase/components/Banner/Banner.styled";

const propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

const Banner = ({ className, children }) => {
  return <BannerRoot className={className}>{children}</BannerRoot>;
};

Banner.propTypes = propTypes;

export default Banner;
