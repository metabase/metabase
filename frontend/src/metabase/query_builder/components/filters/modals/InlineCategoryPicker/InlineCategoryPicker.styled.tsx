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

export const PickerGrid = styled.div`
  margin: ${space(1)} 0;
  display: grid;
  align-items: center;
  gap: ${space(2)};
`;
