import styled from "@emotion/styled";

import _LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { Icon } from "metabase/ui";

const TRANSITION_DURATION = () => (isReducedMotionPreferred() ? "0" : "0.25s");

export const Container = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.8em;
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
  padding: 1.1em;
`;

export const Description = styled.div`
  white-space: pre-line;
  max-height: 200px;
  overflow: auto;
  margin-bottom: 0.5em;
`;

export const EmptyDescription = styled(Description)`
  color: ${({ theme }) => theme.fn.themeColor("text-light")};
  font-weight: 700;
`;

export const LabelContainer = styled.div`
  display: inline-flex;
  align-items: center;
  column-gap: 0.3em;
  font-size: 1em;
  font-weight: normal;
  color: ${({ color: _color = "brand" }) => color(_color)};
  margin-bottom: 0.5rem;
`;

export const Label = styled.span`
  font-size: 1em;
  line-height: 1em;
`;

export const RelativeSizeIcon = styled(Icon)`
  height: 1em;
  width: 1em;
`;

export const InvertedColorRelativeSizeIcon = styled(RelativeSizeIcon)`
  background-color: ${color("brand")};
  color: ${color("white")};
  border-radius: 0.3em;
  padding: 0.3em;
`;

type FadeProps = {
  visible?: boolean;
};

export const Fade = styled.div<FadeProps>`
  width: 100%;
  transition: opacity ${TRANSITION_DURATION} linear;
  opacity: ${({ visible }) => (visible ? "1" : "0")};

  &:empty {
    display: none;
  }
`;

export const LoadingSpinner = styled(_LoadingSpinner)`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: center;
  color: ${color("brand")};
`;

export const Table = styled.table`
  font-size: 1em;

  th {
    font-weight: normal;
  }

  td {
    font-weight: bold;
  }
`;
