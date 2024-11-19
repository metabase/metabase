import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link } from "react-router";
interface Props {
  disabled?: boolean;
}

export const Root = styled.li<Props>`
  position: relative;

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `};
`;

export const ListItemLink = styled(Link)`
  &:hover {
    color: var(--mb-color-brand);
  }
`;
