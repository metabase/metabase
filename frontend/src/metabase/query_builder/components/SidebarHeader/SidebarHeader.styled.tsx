import styled from "@emotion/styled";
import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const HeaderIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

const getBackButtonStyle = (theme: Theme) => css`
  cursor: pointer;
  &:hover {
    color: ${theme.fn.themeColor("brand")};
  }
`;

const getDefaultBackButtonStyle = (theme: Theme) => css`
  ${getBackButtonStyle(theme)}
  color: ${theme.fn.themeColor("text-medium")};
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
  theme: Theme,
) {
  if (variant === "default") {
    return;
  }
  return variant === "default-back-button"
    ? getDefaultBackButtonStyle(theme)
    : getBackButtonStyle(theme);
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

  ${props => getHeaderTitleContainerVariantStyle(props.variant, props.theme)}
`;

export const CloseButton = styled.a`
  color: ${color("text-dark")};
  text-decoration: none;

  margin-left: auto;

  &:hover {
    color: ${color("brand")};
  }
`;
