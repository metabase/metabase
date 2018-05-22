import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import TitleAndDescription from "metabase/components/TitleAndDescription";

const DEFAULT_BACK = () => window.history.back();

const HeaderWithBack = ({ name, description, onBack }) => (
  <div className="flex align-center">
    {(onBack || window.history.length > 1) && (
      <Icon
        className="cursor-pointer text-brand mr2 flex align-center circle p2 bg-light-blue bg-brand-hover text-white-hover transition-background transition-color"
        name="backArrow"
        onClick={onBack || DEFAULT_BACK}
      />
    )}
    <TitleAndDescription title={name} description={description} />
  </div>
);

HeaderWithBack.propTypes = {
  name: PropTypes.string.isRequired,
};

export default HeaderWithBack;
