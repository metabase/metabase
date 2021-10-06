import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";

import { HeaderContainer, Header, ToggleIcon } from "./CollapseSection.styled";

const propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  header: PropTypes.node,
  headerClass: PropTypes.string,
  bodyClass: PropTypes.string,
  initialState: PropTypes.oneOf(["expanded", "collapsed"]),
  iconVariant: PropTypes.oneOf(["right-down", "up-down"]),
  iconPosition: PropTypes.oneOf(["left", "right"]),
};

function CollapseSection({
  initialState = "collapsed",
  iconVariant = "right-down",
  iconPosition = "left",
  header,
  headerClass,
  className,
  bodyClass,
  children,
}) {
  const [isExpanded, setIsExpanded] = useState(initialState === "expanded");

  const toggle = useCallback(() => {
    setIsExpanded(isExpanded => !isExpanded);
  }, []);

  const onKeyDown = useCallback(
    e => {
      if (e.key === "Enter") {
        toggle();
      }
    },
    [toggle],
  );

  const HeaderIcon = (
    <ToggleIcon
      isExpanded={isExpanded}
      variant={iconVariant}
      position={iconPosition}
    />
  );

  return (
    <div className={className} role="tab" aria-expanded={isExpanded}>
      <HeaderContainer
        className={headerClass}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {iconPosition === "left" && HeaderIcon}
        <Header>{header}</Header>
        {iconPosition === "right" && HeaderIcon}
      </HeaderContainer>
      <div role="tabpanel">
        {isExpanded && <div className={bodyClass}>{children}</div>}
      </div>
    </div>
  );
}

CollapseSection.propTypes = propTypes;

export default CollapseSection;
