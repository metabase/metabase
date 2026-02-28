// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import { color } from "metabase/ui/utils/colors";

export const VisualizationRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

interface VisualizationHeaderProps {
  isCompact?: boolean;
}

// Remember to update DASHCARD_HEADER_HEIGHT if height of this element changes
export const VisualizationHeader = styled.div<VisualizationHeaderProps>`
  padding: 0.625rem 0.5rem ${(props) => (props.isCompact ? "0" : "0.375rem")}
    0.5rem;
  flex-shrink: 0;
`;

interface VisualizationSlowSpinnerProps {
  isUsuallySlow: boolean;
}

export const VisualizationActionButtonsContainer = styled.span`
  display: flex;
  align-items: center;
`;

export const VisualizationSlowSpinner = styled(
  LoadingSpinner,
)<VisualizationSlowSpinnerProps>`
  color: ${(props) =>
    props.isUsuallySlow ? color("accent4") : color("text-secondary")};
`;
