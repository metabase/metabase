import styled from "@emotion/styled";
import { css } from "@emotion/react";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

const placeholderVizStyle = css`
  opacity: 0.2;
  filter: grayscale();
  pointer-events: none;
`;

export const VisualizationRoot = styled.div<{ isPlaceholder?: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;

  ${({ isPlaceholder }) => isPlaceholder && placeholderVizStyle}
`;

export const VisualizationHeader = styled.div`
  padding: 0.5rem;
  flex-shrink: 0;
`;

export interface VisualizationSlowSpinnerProps {
  isUsuallySlow: boolean;
}

export const VisualizationActionButtonsContainer = styled.span`
  display: flex;
  align-items: center;
`;

export const VisualizationSlowSpinner = styled(
  LoadingSpinner,
)<VisualizationSlowSpinnerProps>`
  color: ${props =>
    props.isUsuallySlow ? color("accent4") : color("text-medium")};
`;
