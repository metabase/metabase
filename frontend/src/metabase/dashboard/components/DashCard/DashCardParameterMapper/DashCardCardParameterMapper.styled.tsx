import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { alpha, color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const Container = styled.div<{ isSmall: boolean }>`
  margin: ${({ isSmall }) => (isSmall ? 0 : space(1))} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 0.25rem;
`;

export const TextCardDefault = styled.div`
  color: var(--mb-color-text-dark);
  margin: ${space(1)} 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  line-height: 1.5rem;
`;

export const CardLabel = styled.div`
  font-size: 0.83em;
  margin-bottom: ${space(1)};
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  max-width: 100px;
`;

export const Header = styled.h4`
  width: 100%;
  color: var(--mb-color-text-medium);
  margin-bottom: ${space(1)};
  text-align: center;
`;

export const TargetButton = styled.div<{ variant: string }>`
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--mb-color-bg-white);
  cursor: pointer;
  border: 2px solid var(--mb-color-brand);
  border-radius: 8px;
  min-height: 30px;
  padding: 0.25em 0.5em;
  margin: 0 0.25rem;
  color: var(--mb-color-text-medium);

  ${({ variant }) =>
    variant === "disabled" &&
    css`
      pointer-events: none;
      opacity: 0.4;
      border-color: inherit;
    `}

  ${({ variant, theme }) =>
    variant === "mapped" &&
    css`
      border-color: ${theme.fn.themeColor("brand")};
      background-color: ${theme.fn.themeColor("brand")};
      color: var(--mb-color-text-white);
    `}

  ${({ variant, theme }) =>
    variant === "unauthed" &&
    css`
      pointer-events: none;
      border-color: var(--mb-color-bg-light);
      background-color: var(--mb-color-bg-light);
      color: ${theme.fn.themeColor("text-medium")};
    `}

  ${({ variant, theme }) =>
    variant === "invalid" &&
    css`
      border-color: ${theme.fn.themeColor("error")};
      background-color: ${theme.fn.themeColor("error")};
      color: var(--mb-color-text-white);
    `}
`;

TargetButton.defaultProps = {
  tabIndex: 0,
  role: "button",
};

export const TargetButtonText = styled.span`
  overflow: hidden;
  text-align: center;
  margin-right: ${space(1)};
`;

export const CloseIconButton = styled(Button)<{ icon?: string; size?: number }>`
  color: var(--mb-color-text-white);
  background-color: transparent;
  border: none;
  padding: ${space(0)} !important;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: ${() => alpha("bg-white", 0.2)};
  }
`;

CloseIconButton.defaultProps = {
  icon: "close",
  size: 12,
};

export const ChevrondownIcon = styled(Icon)`
  margin-top: 2px;
`;

ChevrondownIcon.defaultProps = {
  name: "chevrondown",
  size: 12,
};

export const KeyIcon = styled(Icon)`
  flex: 1;
`;

KeyIcon.defaultProps = {
  name: "key",
  size: 18,
};

export const Warning = styled.span`
  margin-top: ${space(1)};
  margin-bottom: -${space(1)};
  padding: ${space(4)} 0;
  text-align: center;
`;
