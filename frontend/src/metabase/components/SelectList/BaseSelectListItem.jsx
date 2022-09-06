import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";

import { BaseItemRoot } from "./SelectListItem.styled";

const propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  isSelected: PropTypes.bool,
  size: PropTypes.oneOf(["small", "medium"]),
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
  as: PropTypes.element,
};

export function BaseSelectListItem({
  id,
  onSelect,
  isSelected = false,
  size = "medium",
  className,
  as = BaseItemRoot,
  children,
  ...rest
}) {
  const ref = useScrollOnMount();
  const Root = as;
  return (
    <Root
      ref={isSelected ? ref : undefined}
      isSelected={isSelected}
      role="menuitem"
      tabIndex={0}
      size={size}
      onClick={() => onSelect(id)}
      onKeyDown={e => e.key === "Enter" && onSelect(id)}
      className={className}
      {...rest}
    >
      {children}
    </Root>
  );
}

BaseSelectListItem.propTypes = propTypes;
