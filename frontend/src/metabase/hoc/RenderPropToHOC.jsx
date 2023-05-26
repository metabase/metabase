import React from "react";

/**
 * @deprecated HOCs are deprecated
 */
export default function renderPropToHoc(RenderPropComponent) {
  // eslint-disable-next-line react/display-name
  return ComposedComponent => props =>
    (
      <RenderPropComponent {...props}>
        {childrenProps => <ComposedComponent {...props} {...childrenProps} />}
      </RenderPropComponent>
    );
}
