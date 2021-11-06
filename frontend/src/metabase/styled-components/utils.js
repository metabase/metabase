import React, { forwardRef } from "react";

// this function should be removed after we update to styled-components v4
export function forwardRefToInnerRef(Component) {
  return forwardRef(function StyledComponentWithInnerRef(props, ref) {
    return <Component {...props} innerRef={ref} />;
  });
}
