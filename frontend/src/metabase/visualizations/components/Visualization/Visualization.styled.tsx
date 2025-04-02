// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

export const VisualizationRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

interface VisualizationSlowSpinnerProps {
  isUsuallySlow: boolean;
}

export const VisualizationSlowSpinner = styled(
  LoadingSpinner,
)<VisualizationSlowSpinnerProps>`
  color: ${(props) =>
    props.isUsuallySlow ? color("accent4") : color("text-medium")};
`;
