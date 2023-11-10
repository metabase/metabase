import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";

import { color } from "metabase/lib/colors";

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
