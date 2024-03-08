import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const TriggerIcon = styled(Icon)`
  display: none;
  margin: 0 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }

  ${breakpointMinSmall} {
    display: inherit;
  }
`;
