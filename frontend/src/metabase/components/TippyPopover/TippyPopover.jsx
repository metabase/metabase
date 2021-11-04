import React from "react";
import PropTypes from "prop-types";
import Tippy from "@tippyjs/react";

TippyPopover.propTypes = {
  children: PropTypes.node,
  renderContent: PropTypes.func.isRequired,
};

function TippyPopover({ renderContent, children, ...rest }) {
  return (
    <Tippy {...rest} render={renderContent}>
      {children}
    </Tippy>
  );
}

export default TippyPopover;
