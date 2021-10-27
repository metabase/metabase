import styled from "styled-components";
import { Flex } from "grid-styled";

import { alpha, color, lighten } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

function getPinnedBackground(model) {
  return model === "dashboard"
    ? color("accent4")
    : lighten(color("accent4"), 0.28);
}

function getPinnedForeground(model) {
  return model === "dashboard" ? color("white") : color("accent4");
}

function getBackground(model) {
  if (model === "dataset") {
    return alpha(color("accent2"), 0.08);
  }
  return model === "dashboard" ? color("brand") : color("brand-light");
}

function getForeground(model) {
  if (model === "dataset") {
    return color("accent2");
  }
  return model === "dashboard" ? color("white") : color("brand");
}

export const EntityIconWrapper = styled(IconButtonWrapper)`
  background-color: ${color("bg-medium")};
  padding: 12px;

  color: ${props =>
    props.isPinned
      ? getPinnedForeground(props.model)
      : getForeground(props.model)};

  background-color: ${props =>
    props.isPinned
      ? getPinnedBackground(props.model)
      : getBackground(props.model)};
`;

export const EntityItemWrapper = styled(Flex)`
  align-items: center;
  &:hover {
    color: ${color("brand")};
  }
`;
