import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button/Button";

export const TRANSITION_CLASSNAMES_PREFIX = "filter-apply-button";
export const BUTTON_TRANSITION_DURATION = 200;

export const ApplyButton = styled(Button)<{ isVisible: boolean }>`
  margin-left: auto;
  margin-top: ${space(1)};

  opacity: ${({ isVisible }) => (isVisible ? 1 : 0)};
  visibility: ${({ isVisible }) => (isVisible ? "visible" : "hidden")};

  &,
  &:hover {
    transition-property: opacity, visibility;
  }

  &.${TRANSITION_CLASSNAMES_PREFIX}-enter {
    opacity: 0;
    transition: none;
  }

  &.${TRANSITION_CLASSNAMES_PREFIX}-enter-active {
    opacity: 1;
    transition: opacity ${BUTTON_TRANSITION_DURATION}ms;
  }

  &.${TRANSITION_CLASSNAMES_PREFIX}-exit {
    opacity: 1;
    transition: none;
  }

  &.${TRANSITION_CLASSNAMES_PREFIX}-exit-active {
    opacity: 0;
    transition: opacity ${BUTTON_TRANSITION_DURATION}ms;
  }
`;
