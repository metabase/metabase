import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const AggregationAndBreakoutDescription = styled.span<{
  onClick?: () => void;
}>`
  ${({ onClick }) =>
    onClick &&
    css`
      cursor: pointer;
    `}
`;
