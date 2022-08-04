import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const ShareIcon = styled(Icon)`
  margin: 0 0.5rem;
  display: none;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }

  ${breakpointMinSmall} {
    display: inherit;
  }
`;
