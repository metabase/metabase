import { css } from "@emotion/react";
import styled from "@emotion/styled";

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
