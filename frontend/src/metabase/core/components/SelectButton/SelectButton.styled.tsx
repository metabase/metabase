import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

interface SelectButtonRootProps {
  hasValue: boolean;
  fullWidth: boolean;
}

export const SelectButtonRoot = styled.button<SelectButtonRootProps>`
  cursor: pointer;
  display: flex;
  width: ${props => (props.fullWidth ? "100%" : "unset")};
  align-items: center;
  padding: 0.6em;
  border: 1px solid ${color("border")};
  background-color: ${color("white")};
  border-radius: 8px;
  font-weight: 700;
  min-width: 104px;
  transition: all 200ms;
  color: ${props =>
    props.hasValue ? color("text-dark") : color("text-light")};

  &:focus {
    border-color: ${color("brand")};
    outline: 2px solid ${color("focus")};
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

export const SelectButtonIcon = styled(Icon)`
  display: flex;
  margin-left: auto;
  color: ${color("text-medium")};
`;

export const SelectButtonContent = styled.span`
  margin-right: 0.5rem;
`;
