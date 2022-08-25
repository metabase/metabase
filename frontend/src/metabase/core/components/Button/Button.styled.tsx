import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";

export interface ButtonRootProps {
  purple?: boolean;
}

export const ButtonRoot = styled.button<ButtonRootProps>`
  transition: all 200ms linear;
  flex-shrink: 0;

  ${({ purple }) =>
    purple &&
    css`
      color: ${color("white")};
      background-color: ${color("filter")};
      border: 1px solid ${color("filter")};

      &:hover {
        color: ${color("white")};
        background-color: ${alpha("filter", 0.88)};
        border-color: ${alpha("filter", 0.88)};
      }
    `}
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
