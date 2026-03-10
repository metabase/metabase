// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ComponentProps } from "react";

import { LoadingSpinner as LoadingSpinnerBase } from "metabase/common/components/LoadingSpinner";
import { isReducedMotionPreferred } from "metabase/lib/dom";

const TRANSITION_DURATION = () => (isReducedMotionPreferred() ? "0" : "0.25s");

export const Container = styled.div`
  font-size: 1em;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6em;
  height: auto;
  overflow: hidden;
`;

export const NoWrap = styled.div`
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-weight: bold;
  padding-top: 0.3em 0;
  line-height: 1.3em;
`;

type LoadingSpinnerProps = ComponentProps<typeof LoadingSpinnerBase>;

export const LoadingSpinner = styled((props: LoadingSpinnerProps) => (
  <LoadingSpinnerBase {...props} size={props.size ?? 18} />
))`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: center;
  color: var(--mb-color-brand);
`;

export const RelativeContainer = styled.div<{ height?: string }>`
  position: relative;
  height: ${({ height }) => height || "1em"};
  line-height: 1em;
`;

export const Fade = styled.div<{ visible?: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transition: opacity ${TRANSITION_DURATION} linear;
  opacity: ${({ visible }) => (visible ? "1" : "0")};
`;

export const FadeAndSlide = styled.div<{ visible?: boolean }>`
  position: absolute;
  width: 100%;
  transition:
    opacity ${TRANSITION_DURATION} linear,
    transform ${TRANSITION_DURATION} linear;
  opacity: ${({ visible }) => (visible ? "1" : "0")};
  transform: ${({ visible }) =>
    visible ? "translateY(0)" : "translateY(100%)"};
`;

export const Li = styled.li`
  padding: 0.3em 0;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid var(--mb-color-border);

  &:last-child {
    border-bottom: none;
  }
`;
