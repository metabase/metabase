import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import _LoadingSpinner from "metabase/components/LoadingSpinner";
import { isReducedMotionPreferred } from "metabase/lib/dom";

import TableLabel from "../TableLabel/TableLabel";

const TRANSITION_DURATION = () => (isReducedMotionPreferred() ? "0" : "0.25s");

export const InteractiveTableLabel = styled(TableLabel)`
  cursor: pointer;
  color: ${color("text-light")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const Container = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space(1)};
  overflow: auto;
`;

export const LoadingSpinner = styled(_LoadingSpinner).attrs({
  size: 24,
})`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: center;
  color: ${color("brand")};
`;

export const AbsoluteContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`;

type FadeProps = {
  visible?: boolean;
};

export const Fade = styled.div<FadeProps>`
  width: 100%;
  transition: opacity ${TRANSITION_DURATION} linear;
  opacity: ${({ visible }) => (visible ? "1" : "0")};
`;

export const FadeAndSlide = styled.div<FadeProps>`
  width: 100%;
  transition: opacity ${TRANSITION_DURATION} linear,
    transform ${TRANSITION_DURATION} linear;
  opacity: ${({ visible }) => (visible ? "1" : "0")};
`;
