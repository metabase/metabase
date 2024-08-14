import PropTypes from "prop-types";

import { BannerRoot } from "metabase/components/Banner/Banner.styled";
import Markdown from "metabase/core/components/Markdown";

const propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

const Banner = ({ className, children }) => {
  const content =
    typeof children === "string" ? <Markdown>{children}</Markdown> : children;

  return <BannerRoot className={className}>{content}</BannerRoot>;
};

Banner.propTypes = propTypes;

export default Banner;
