import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  space,
  breakpointMinHeightMedium,
} from "metabase/styled-components/theme";

import LoadingSpinner from "metabase/components/LoadingSpinner";

export const Loading = styled(LoadingSpinner)`
  margin: ${space(1)} 0;
  color: ${color("brand")};
`;

export const PickerContainer = styled.div`
  font-weight: bold;
`;

export const PickerGrid = styled.div`
  margin: ${space(2)} 0;
  display: grid;
  align-items: center;
  gap: ${space(2)};
`;

export const TokenFieldContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  padding: ${space(0)};
  gap: ${space(0)};
  font-weight: bold;
  cursor: pointer;

  max-height: 200px;
  overflow-y: auto;

  border-radius: ${space(1)};
  border: 1px solid ${color("border-dark")};
`;

export const AddText = styled.div`
  min-height: 30px;

  ${breakpointMinHeightMedium} {
    height: 46px;
  }
  margin-left: ${space(1)};
  border: none;
  display: flex;
  align-items: center;

  color: ${color("text-light")};
`;
