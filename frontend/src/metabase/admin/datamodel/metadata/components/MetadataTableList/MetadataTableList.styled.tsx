import styled from "@emotion/styled";
import { css } from "@emotion/react";

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
