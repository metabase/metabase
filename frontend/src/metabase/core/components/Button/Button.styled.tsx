import styled from "@emotion/styled";
import { css } from "@emotion/react";

export const ButtonRoot = styled.button`
  transition: all 200ms linear;
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

export interface ButtonTextContainerProps {
  iconVertical: boolean;
  hasIcon: boolean;
  hasRightIcon: boolean;
}

const verticalTopIconCSS = css`
  margin-top: 0.5rem;
`;

const verticalBottomIconCSS = css`
  margin-bottom: 0.5rem;
`;

const horizontalLeftIconCSS = css`
  margin-left: 0.5rem;
`;

const horizontalRightIconCSS = css`
  margin-right: 0.5rem;
`;

export const ButtonTextContainer = styled.div<ButtonTextContainerProps>`
  ${props => {
    if (props.hasIcon) {
      return props.iconVertical ? verticalTopIconCSS : horizontalLeftIconCSS;
    }
  }}

  ${props => {
    if (props.hasRightIcon) {
      return props.iconVertical
        ? verticalBottomIconCSS
        : horizontalRightIconCSS;
    }
  }}
`;
