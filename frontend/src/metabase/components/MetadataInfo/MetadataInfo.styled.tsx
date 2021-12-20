import styled from "styled-components";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import _LoadingSpinner from "metabase/components/LoadingSpinner";

const TRANSITION_DURATION = () => (isReducedMotionPreferred() ? "0" : "0.25s");

export const Container = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space(1)};
  overflow: auto;
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

export const InfoContainer = styled(Container)`
  padding: ${space(2)};
`;

export const Description = styled.div`
  font-size: 14px;
  white-space: pre-line;
  max-height: 200px;
  overflow: auto;
`;

export const EmptyDescription = styled(Description)`
  color: ${color("text-light")};
  font-weight: 700;
`;

export const LabelContainer = styled.div`
  display: inline-flex;
  align-items: center;
  column-gap: ${space(0)};
  font-size: 12px;
  color: ${({ color: _color = "brand" }) => color(_color)};
`;

export const Label = styled.span`
  font-weight: bold;
  font-size: 1em;
`;

export const RelativeSizeIcon = styled(Icon)`
  height: 1em;
  width: 1em;
`;

export const InvertedColorRelativeSizeIcon = styled(RelativeSizeIcon)`
  padding: ${space(0)};
  background-color: ${color("brand")};
  color: ${color("white")};
  border-radius: ${space(0)};
  padding: ${space(0)};
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

export const LoadingSpinner = styled(_LoadingSpinner)`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: center;
  color: ${color("brand")};
`;
