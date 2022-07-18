import React from "react";

export default function renderPropToHoc(RenderPropComponent) {
  // eslint-disable-next-line react/display-name
  return ComposedComponent => props =>
    (
      <RenderPropComponent {...props}>
        {childrenProps => <ComposedComponent {...props} {...childrenProps} />}
      </RenderPropComponent>
    );
}
