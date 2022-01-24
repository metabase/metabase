import styled from "styled-components";
import { Flex } from "grid-styled";

import { alpha, color, darken, lighten } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import LoadingSpinner from "metabase/components/LoadingSpinner";

function getPinnedBackground(model, disabled) {
  return disabled
    ? color("border")
    : model === "dashboard"
    ? color("accent4")
    : lighten(color("accent4"), 0.28);
}

function getPinnedForeground(model, disabled) {
  return disabled
    ? darken(color("border"), 0.38)
    : model === "dashboard"
    ? color("white")
    : color("accent4");
}

function getBackground(model, disabled) {
  return disabled
    ? color("border")
    : model === "dataset"
    ? alpha(color("accent2"), 0.08)
    : model === "dashboard"
    ? color("brand")
    : color("brand-light");
}

function getForeground(model, disabled) {
  return disabled
    ? darken(color("border"), 0.38)
    : model === "dataset"
    ? color("accent2")
    : model === "dashboard"
    ? color("white")
    : color("brand");
}

export const EntityIconWrapper = styled(IconButtonWrapper)`
  background-color: ${color("bg-medium")};
  padding: 12px;
  cursor: ${props => (props.disabled ? "default" : "pointer")};

  color: ${props =>
    props.isPinned
      ? getPinnedForeground(props.model, props.disabled)
      : getForeground(props.model, props.disabled)};

  background-color: ${props =>
    props.isPinned
      ? getPinnedBackground(props.model, props.disabled)
      : getBackground(props.model, props.disabled)};
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
