import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { alpha, color } from "metabase/lib/colors";

export interface ButtonRootProps {
  purple?: boolean;
  onlyText?: boolean;
  light?: boolean;
}

export const ButtonRoot = styled.button<ButtonRootProps>`
  transition: all 200ms linear;
  flex-shrink: 0;

  @media (prefers-reduced-motion) {
    &,
    &:hover {
      transition: none;
    }
  }

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

  ${({ onlyText }) =>
    onlyText &&
    css`
      border: none;
      padding: 0;
      color: ${color("brand")};

      &:hover {
        background-color: unset;
      }
    `}

  ${({ light }) =>
    light &&
    css`
      border: none;
      height: fit-content;
      line-height: 1.5rem;
      padding: 0.5rem;
      color: ${color("brand")};

      &:hover {
        background-color: ${color("bg-light")};
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
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;

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
