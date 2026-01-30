// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LoadingSpinner as LoadingSpinnerBase } from "metabase/common/components/LoadingSpinner";
import type { ColorName } from "metabase/lib/colors/types";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

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

export const LabelContainer = styled.div<{ color?: ColorName }>`
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

export const LoadingSpinner = styled(LoadingSpinnerBase)`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: center;
  color: var(--mb-color-brand);
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
