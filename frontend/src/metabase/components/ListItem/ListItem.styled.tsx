import { css } from "@emotion/react";
import styled from "@emotion/styled";

interface Props {
  disabled?: boolean;
}

export const Root = styled.li<Props>`
  position: resize;

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `};
`;
