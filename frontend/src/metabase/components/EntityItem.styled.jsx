import styled from "styled-components";
import { Flex } from "grid-styled";

import { color, darken, lighten } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

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
    : model === "dashboard"
    ? color("brand")
    : color("brand-light");
}

function getForeground(model, disabled) {
  return disabled
    ? darken(color("border"), 0.38)
    : model === "dashboard"
    ? color("white")
    : color("brand");
}

export const EntityIconWrapper = styled(IconButtonWrapper)`
  background-color: ${color("bg-medium")};
  padding: 12px;

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
