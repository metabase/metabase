import styled from "@emotion/styled";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

export interface VisualizationSlowSpinnerProps {
  isUsuallySlow: boolean;
}

export const VisualizationSlowSpinner = styled(
  LoadingSpinner,
)<VisualizationSlowSpinnerProps>`
  color: ${props =>
    props.isUsuallySlow ? color("accent4") : color("text-medium")};
`;
