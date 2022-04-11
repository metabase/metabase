import styled from "@emotion/styled";

export const ButtonRoot = styled.button`
  flex-shrink: 0;
`;

export interface ButtonContentProps {
  iconVertical?: boolean;
}

export const ButtonContent = styled.div<ButtonContentProps>`
  display: flex;
  flex-direction: ${props => (props.iconVertical ? "column" : "row")};
  align-items: center;
  justify-content: center;
  min-width: ${props => (props.iconVertical ? "60px" : "")};
`;
