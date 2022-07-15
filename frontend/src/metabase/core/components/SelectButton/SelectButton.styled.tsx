import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { space } from "metabase/styled-components/theme";
interface SelectButtonRootProps {
  hasValue: boolean;
  fullWidth: boolean;
  highlighted: boolean;
}

const getColor = ({ hasValue, highlighted }: SelectButtonRootProps) => {
  if (hasValue) {
    return highlighted ? color("text-white") : color("text-dark");
  } else {
    return color("text-light");
  }
};

export const SelectButtonRoot = styled.button<SelectButtonRootProps>`
  cursor: pointer;
  display: flex;
  width: ${props => (props.fullWidth ? "100%" : "unset")};
  align-items: center;
  padding: 0.6em;
  border: 1px solid
    ${({ hasValue, highlighted }) =>
      hasValue && highlighted ? color("brand") : color("border-dark")};
  background-color: ${({ hasValue, highlighted }) =>
    hasValue && highlighted ? color("brand") : color("white")};
  border-radius: ${space(1)};
  font-weight: 700;
  min-width: 104px;
  transition: all 200ms;
  color: ${getColor};

  &:focus {
    border-color: ${() => color("brand")};
    outline: 2px solid ${() => color("focus")};
  }

  &:not(:focus-visible) {
    outline: none;
  }

  &:disabled {
    background-color: ${color("bg-light")};
    color: ${color("text-medium")};
    pointer-events: none;
  }
`;

interface SelectButtonIconProps {
  hasValue: boolean;
  highlighted: boolean;
}

export const SelectButtonIcon = styled(Icon)<SelectButtonIconProps>`
  display: flex;
  margin-left: auto;
  color: ${({ hasValue, highlighted }) =>
    hasValue && highlighted ? color("text-white") : color("text-medium")};
`;

export const SelectButtonContent = styled.span`
  margin-right: 0.5rem;
`;
