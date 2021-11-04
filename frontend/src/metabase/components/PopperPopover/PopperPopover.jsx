import React, { useState } from "react";
import PropTypes from "prop-types";

import { usePopper } from "react-popper";

PopperPopover.propTypes = {
  renderTarget: PropTypes.func.isRequired,
  renderContent: PropTypes.func.isRequired,
  renderArrow: PropTypes.func,
  popperOptions: PropTypes.object,
};

function PopperPopover({
  renderTarget,
  renderContent,
  renderArrow,
  popperOptions,
}) {
  const [referenceElement, setReferenceElement] = useState(null);
  const [popperElement, setPopperElement] = useState(null);
  const [arrowElement, setArrowElement] = useState(null);
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    modifiers: [{ name: "arrow", options: { element: arrowElement } }],
  });

  return (
    <React.Fragment>
      {renderTarget(setReferenceElement)}
      <div ref={setPopperElement} style={styles.popper} {...attributes.popper}>
        {renderContent()}
        {renderArrow && renderArrow(setArrowElement, styles.arrow)}
      </div>
    </React.Fragment>
  );
}

export default PopperPopover;
