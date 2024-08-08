import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const HEADER_ICON_SIZE = 16;

export const StyledAnchor = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;

  &:hover {
    color: ${color("text-dark")};
  }
`;

export const ActionIcon = styled(Icon)``;

ActionIcon.defaultProps = {
  size: HEADER_ICON_SIZE,
};
