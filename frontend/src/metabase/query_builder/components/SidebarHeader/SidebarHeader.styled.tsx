import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const HeaderIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

const backButtonStyle = () => css`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

const defaultBackButtonStyle = () => css`
  ${backButtonStyle()}
  color: ${color("text-medium")};
  font-size: 0.83em;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export type HeaderTitleContainerVariant =
  | "default"
  | "back-button"
  | "default-back-button";

function getHeaderTitleContainerVariantStyle(
  variant: HeaderTitleContainerVariant = "default",
) {
  if (variant === "default") {
    return;
  }
  return variant === "default-back-button"
    ? defaultBackButtonStyle()
    : backButtonStyle();
}

export const HeaderTitleContainer = styled.span<{
  variant?: HeaderTitleContainerVariant;
}>`
  display: flex;
  align-items: center;
  font-size: 1.17em;
  font-weight: bold;
  margin-top: 0;
  margin-bottom: 0;

  ${props => getHeaderTitleContainerVariantStyle(props.variant)}
`;

export const CloseButton = styled.a`
  color: ${color("text-dark")};
  text-decoration: none;
  margin-left: auto;

  &:hover {
    color: ${color("brand")};
  }
`;
