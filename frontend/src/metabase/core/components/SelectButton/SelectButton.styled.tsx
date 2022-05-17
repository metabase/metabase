import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { SelectButtonVariant } from "./types";
import { css } from "@emotion/react";

interface SelectButtonRootProps {
  variant: SelectButtonVariant;
  hasValue: boolean;
  fullWidth: boolean;
}

export const SelectButtonIcon = styled(Icon)`
  display: flex;
  margin-left: auto;
`;

const primaryStyles = () => css`
  color: ${color("text-white")};
  border-color: ${color("brand")};
  background-color: ${color("brand")};

  ${SelectButtonIcon} {
    color: ${color("text-white")};
  }
`;

const secondaryStyles = (props: SelectButtonRootProps) => css`
  color: ${props.hasValue ? color("text-dark") : color("text-light")};
  border-color: ${color("border")};
  background-color: ${color("white")};

  ${SelectButtonIcon} {
    color: ${color("text-medium")};
  }
`;

export const SelectButtonRoot = styled.button<SelectButtonRootProps>`
  cursor: pointer;
  display: flex;
  width: ${props => (props.fullWidth ? "100%" : "unset")};
  align-items: center;
  padding: 0.6em;
  border: 1px solid transparent;
  border-radius: 8px;
  font-weight: 700;
  min-width: 104px;
  transition: all 200ms;

  &:focus {
    border-color: ${color("brand")};
    outline: 2px solid ${color("focus")};
  }

  &:not(:focus-visible) {
    outline: none;
  }

  &:disabled {
    color: ${color("text-medium")};
    background-color: ${color("bg-light")};
    pointer-events: none;
  }

  ${props => props.variant === "primary" && primaryStyles};
  ${props => props.variant === "secondary" && secondaryStyles};
`;

export const SelectButtonContent = styled.span`
  margin-right: 0.5rem;
`;
