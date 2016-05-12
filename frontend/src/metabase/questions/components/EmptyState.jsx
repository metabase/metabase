import React, { PropTypes } from "react";
import Icon from "metabase/components/Icon.jsx";

const EmptyState = ({ message, icon }) =>
  <div className="text-centered mt4 text-brand-light">
    <Icon name={icon} width={40} height={40} />
    <h2 className="text-brand-light mt4">{message}</h2>
  </div>

EmptyState.propTypes = {
    message:    PropTypes.string.isRequired,
    icon:       PropTypes.string.isRequired,
};

export default EmptyState;
