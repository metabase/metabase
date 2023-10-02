import styled from "@emotion/styled";

export const VisualizationRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
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
