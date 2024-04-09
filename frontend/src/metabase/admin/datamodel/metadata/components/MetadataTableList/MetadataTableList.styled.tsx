import { css } from "@emotion/react";
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

interface AdminListItemProps {
  disabled?: boolean;
}

export const AdminListItem = styled.a<AdminListItemProps>`
  ${({ disabled }) =>
    disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `};
`;

export const BackIconContainer = styled.span`
  color: ${color("brand")};
  cursor: pointer;
`;

export const HideIconButton = styled(IconButtonWrapper)`
  float: right;
  cursor: ${props => props.disabled && "not-allowed"};

  &:hover {
    color: ${props => !props.disabled && color("brand")};
  }
`;
