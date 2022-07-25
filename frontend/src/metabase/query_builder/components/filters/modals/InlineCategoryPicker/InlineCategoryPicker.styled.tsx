import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import {
  space,
  breakpointMinHeightMedium,
} from "metabase/styled-components/theme";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";

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
  min-height: 40px;
  ${breakpointMinHeightMedium} {
    min-height: 56px;
  }
  display: flex;
  flex-wrap: wrap;
  font-weight: bold;
`;

export const AddButton = styled(Button)`
  margin-bottom: ${space(0)};
  margin-left: ${space(1)};
  border-radius: ${space(1)};
  padding: ${space(1)} ${space(2)};
  border: 1px solid ${color("border")};
  display: flex;
  align-items: center;

  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const AddButtonIcon = styled(Icon)``;

export const AddButtonLabel = styled.span`
  margin-left: ${space(1)};
`;
