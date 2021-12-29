import React, { forwardRef } from "react";

// this function should be removed after we update to styled-components v4
export function forwardRefToInnerRef<Props>(
  Component: React.ComponentType<Props>,
) {
  return forwardRef(function StyledComponentWithInnerRef(
    props: Props,
    ref?: React.Ref<any>,
  ) {
    return <Component {...props} innerRef={ref} />;
  });
}
