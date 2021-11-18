import React from "react";
import PropTypes from "prop-types";
import * as Tippy from "@tippyjs/react";

import { isReducedMotionPreferred } from "metabase/lib/dom";

const TippyComponent = Tippy.default;

TippyPopover.propTypes = {
  children: PropTypes.node,
  renderContent: PropTypes.func.isRequired,
};

function TippyPopover(props: Tippy.TippyProps) {
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;

  return (
    <TippyComponent
      {...props}
      theme="popover"
      appendTo={() => document.body}
      duration={animationDuration}
    />
  );
}

export default TippyPopover;
