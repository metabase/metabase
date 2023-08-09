import styled from "@emotion/styled";

export interface SwapperElementProps {
  isVisible: boolean;
}

export const SwapperRoot = styled.div`
  position: relative;
`;

export const SwapperDefaultElement = styled.div<SwapperElementProps>`
  transform: scale(${props => (props.isVisible ? 1 : 0)});
`;

export const SwapperLayeredElement = styled.div<SwapperElementProps>`
  position: absolute;
  inset: 0;
  transform: scale(${props => (props.isVisible ? 1 : 0)});
`;
