import styled from "styled-components";

import Icon from "metabase/components/Icon";
import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  ml: 1,
  mr: 2,
  mt: "4px",
  name: "burger",
  size: 20,
})`
  cursor: pointer;

  ${breakpointMinSmall} {
    display: none;
  }
`;
