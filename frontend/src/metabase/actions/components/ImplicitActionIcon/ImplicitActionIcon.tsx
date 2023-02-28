import React from "react";
import Icon from "metabase/components/Icon";
import { Root } from "./ImplicitActionIcon.styled";

interface ImplicitActionIconProps {
  size?: number;
}

function ImplicitActionIcon({ size = 14 }: ImplicitActionIconProps) {
  const sizeSmall = size * 0.375;
  const marginLeft = size * 0.75;
  return (
    <Root>
      <Icon name="insight" size={sizeSmall} style={{ marginLeft }} />
      <Icon name="insight" size={size} />
    </Root>
  );
}

export default ImplicitActionIcon;
