import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { ExpanderContent, ExpanderIcon, ExpanderRoot } from "./Expander.styled";

const propTypes = {
  isExpanded: PropTypes.bool,
  children: PropTypes.node,
  onChange: PropTypes.func,
};

const Expander = ({ isExpanded, children, onChange }) => {
  const handleClick = useCallback(() => {
    onChange && onChange(!isExpanded);
  }, [isExpanded, onChange]);

  return (
    <ExpanderRoot aria-expanded={isExpanded} onClick={handleClick}>
      <ExpanderContent>{children}</ExpanderContent>
      <ExpanderIcon name={isExpanded ? "chevronup" : "chevrondown"} />
    </ExpanderRoot>
  );
};

Expander.propTypes = propTypes;

export default Expander;
