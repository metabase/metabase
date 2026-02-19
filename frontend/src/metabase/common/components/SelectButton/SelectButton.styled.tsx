// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ComponentPropsWithRef } from "react";

import { inputPadding } from "metabase/common/style/input";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
interface SelectButtonRootProps {
  hasValue: boolean;
  fullWidth: boolean;
  highlighted: boolean;
}

const getColor = ({ hasValue, highlighted }: SelectButtonRootProps) => {
  if (hasValue) {
    return highlighted ? color("text-primary-inverse") : color("text-primary");
  } else {
    return color("text-tertiary");
  }
};

export const SelectButtonRoot = styled.button<SelectButtonRootProps>`
  ${inputPadding()}
  cursor: pointer;
  display: flex;
  width: ${(props) => (props.fullWidth ? "100%" : "unset")};
  align-items: center;
  border: 1px solid
    ${({ hasValue, highlighted }) =>
      hasValue && highlighted ? color("brand") : color("border")};
  background-color: ${({ hasValue, highlighted }) =>
    hasValue && highlighted ? color("brand") : color("background-primary")};
  border-radius: var(--mantine-spacing-sm);
  font-weight: 700;
  min-width: 104px;
  transition: all 200ms;
  color: ${getColor};

  &:focus {
    border-color: var(--mb-color-brand);
    outline: 2px solid var(--mb-color-focus);
  }

  &:not(:focus-visible) {
    outline: none;
  }

  &:disabled {
    background-color: var(--mb-color-background-secondary);
    color: var(--mb-color-text-secondary);
    pointer-events: none;
  }
`;

interface SelectButtonIconProps {
  hasValue: boolean;
  highlighted: boolean;
}

export const SelectButtonIcon = styled(
  ({
    hasValue,
    highlighted,
    ...rest
  }: SelectButtonIconProps & ComponentPropsWithRef<typeof Icon>) => (
    <Icon {...rest} />
  ),
)`
  display: flex;
  margin-left: auto;
  color: ${({ hasValue, highlighted }) =>
    hasValue && highlighted
      ? color("text-primary-inverse")
      : color("text-secondary")};
`;

export const SelectButtonContent = styled.span`
  margin-right: 0.5rem;
`;
