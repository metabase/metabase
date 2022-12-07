import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import LoadingSpinner from "metabase/components/LoadingSpinner";

export const Loading = styled(LoadingSpinner)`
  margin: ${space(1)} 0;
  color: ${color("brand")};
`;

export const PickerContainer = styled.div`
  font-weight: bold;
`;

interface PickerGridProps {
  multiColumn?: boolean;
  rows?: number;
}

export const PickerGrid = styled.div<PickerGridProps>`
  display: grid;
  ${props =>
    props.multiColumn
      ? `
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(${props.rows ?? 2}, 1fr);
    grid-auto-flow: column;
  `
      : ""}

  gap: ${space(2)};
`;
