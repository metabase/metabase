import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import LoadingSpinner from "metabase/components/LoadingSpinner";

export const Loading = styled(LoadingSpinner)`
  margin: ${space(1)} 0;
  color: ${color("brand")};
`;

export const PickerContainer = styled.div`
  grid-column: span 3;
  margin: ${space(2)} 0;
  padding-bottom: ${space(2)};
  font-weight: bold;
  border-bottom: 1px solid ${color("border")};
`;

export const PickerGrid = styled.div`
  width: 100%;
  display: grid;
  columns: 2;
  align-items: center;
  grid-template-columns: repeat(3, 1fr);
  gap: ${space(2)};
`;
