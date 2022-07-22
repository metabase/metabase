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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  transform: scale(${props => (props.isVisible ? 1 : 0)});
`;
