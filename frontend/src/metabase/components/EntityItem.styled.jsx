import styled from "styled-components";
import { Flex } from "grid-styled";

import { alpha, color, darken, lighten } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Button from "metabase/components/Button";

function getPinnedForeground(disabled) {
  return disabled ? darken(color("border"), 0.38) : color("accent4");
}

function getForeground(model, disabled) {
  return disabled
    ? darken(color("border"), 0.38)
    : model === "dataset"
    ? color("accent2")
    : color("brand");
}

export const EntityIconWrapper = styled(IconButtonWrapper)`
  background-color: transparent;
  padding: 12px;
  cursor: ${props => (props.disabled ? "default" : "pointer")};

  color: ${props =>
    props.isPinned
      ? getPinnedForeground(props.disabled)
      : getForeground(props.disabled)};
`;

export const EntityItemWrapper = styled(Flex)`
  align-items: center;
  color: ${props =>
    props.disabled ? color("text-medium") : color("text-dark")};

  &:hover {
    color: ${props => (props.disabled ? color("text-medium") : color("brand"))};
  }
`;

export const EntityItemSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: ${color("brand")};
`;

export const EntityMenuContainer = styled(Flex)`
  color: ${color("text-medium")};
`;

export const PinButton = styled(Button)`
  color: ${color("text-medium")};
  border: none;

  &:hover {
    color: ${color("brand")};
  }
`;
