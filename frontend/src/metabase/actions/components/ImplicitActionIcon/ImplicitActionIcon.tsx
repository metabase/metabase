import { Icon } from "metabase/ui";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ImplicitActionIcon;
