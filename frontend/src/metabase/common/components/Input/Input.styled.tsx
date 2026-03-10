import isPropValid from "@emotion/is-prop-valid";
// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import {
  focusOutlineStyle,
  inputPadding,
  inputTypography,
} from "metabase/common/style/input";
import type { ColorName } from "metabase/lib/colors/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { color } from "metabase/ui/utils/colors";

import type { InputSize } from "../../style/types";

interface InputProps {
  fieldSize?: InputSize;
  hasError?: boolean;
  fullWidth?: boolean;
  hasSubtitle?: boolean;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  hasClearButton?: boolean;
  colorScheme: ColorName;
}

interface InputRootProps {
  fullWidth?: boolean;
}

const getHorizontalPadding = (
  inputSize?: InputSize,
  hasIcon?: boolean,
  hasClearButton?: boolean,
) => {
  let padding = inputSize === "small" ? 0.625 : 0.75;

  if (hasIcon) {
    padding += 1.5;
  }

  if (hasClearButton) {
    padding += 1;
  }

  return `${padding}rem`;
};

export const InputRoot = styled.div<InputRootProps>`
  display: inline-flex;
  align-items: center;
  position: relative;
  width: ${(props) => (props.fullWidth ? "100%" : "")};
`;

export const InputField = styled.input<InputProps>`
  ${(props) => inputPadding(props.fieldSize)}
  ${(props) => inputTypography(props.fieldSize)}
  font-family: inherit;
  color: var(--mb-color-text-primary);
  border: 1px solid var(--mb-color-border);
  border-radius: var(--mantine-spacing-sm);
  background-color: ${(props) =>
    props.readOnly
      ? "var(--mb-color-background-disabled)"
      : "var(--mb-color-background-primary)"};
  outline: none;
  text-align: inherit;

  &:focus,
  &:hover {
    border-color: ${(props) => color(props.colorScheme)};
    transition: border 300ms ease-in-out;
  }

  &:disabled {
    cursor: default;
    background-color: var(--mb-color-background-secondary);
  }

  ${(props) => focusOutlineStyle(props.colorScheme)};

  ${(props) =>
    props.hasError &&
    css`
      border-color: var(--mb-color-error);
    `};

  ${(props) =>
    props.fullWidth &&
    css`
      width: 100%;
    `}

  ${(props) =>
    props.fieldSize === "small" &&
    css`
      font-size: 0.875rem;
      line-height: 1rem;
    `};

  padding-left: ${(props) =>
    getHorizontalPadding(props.fieldSize, props.hasLeftIcon)};
  padding-right: ${(props) =>
    getHorizontalPadding(
      props.fieldSize,
      props.hasRightIcon,
      props.hasClearButton,
    )};

  ${(props) =>
    props.hasSubtitle &&
    css`
      padding-top: 1.75rem;
    `};
`;

type InputButtonProps = {
  size: InputSize;
};

const InputButton = styled(IconButtonWrapper)<InputButtonProps>`
  position: absolute;
  color: ${(props) =>
    color(props.onClick != null ? "text-primary" : "text-tertiary")};
  padding: ${(props) => (props.size === "small" ? "0.5rem" : "0.75rem")};
  border-radius: 50%;
  bottom: ${(props) => (props.size === "large" ? "0.125rem" : 0)};

  &:disabled {
    cursor: default;
  }
`;

export const InputLeftButton = styled(InputButton)<InputButtonProps>`
  left: 0;
`;

export const InputRightButton = styled(InputButton)<InputButtonProps>`
  right: 0;
`;

type InputResetButtonProps = {
  hasRightIcon: boolean;
};

// shouldForwardProp: isPropValid is used to prevent passing the `hasRightIcon` prop to the DOM element
export const InputResetButton = styled(InputButton, {
  shouldForwardProp: isPropValid,
})<InputResetButtonProps>`
  right: ${(props) => (props.hasRightIcon ? "1.25rem" : 0)};
`;

export const InputSubtitle = styled.div`
  color: var(--mb-color-text-tertiary);
  position: absolute;
  top: 1.25em;
  left: 1.25em;
  font-family: ${monospaceFontFamily};
  font-size: 0.75em;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  max-width: 90%;
`;
