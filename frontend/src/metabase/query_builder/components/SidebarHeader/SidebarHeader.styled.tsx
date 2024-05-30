import { css, type Theme } from "@emotion/react";
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
  theme: Theme,
  variant: HeaderTitleContainerVariant = "default",
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

  ${props => getHeaderTitleContainerVariantStyle(props.theme, props.variant)}
`;

export const CloseButton = styled.a`
  color: var(--mb-color-text-dark);
  text-decoration: none;

  margin-left: auto;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
