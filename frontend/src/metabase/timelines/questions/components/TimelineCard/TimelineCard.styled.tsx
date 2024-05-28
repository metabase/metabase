import styled from "@emotion/styled";

import CheckBox from "metabase/core/components/CheckBox";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const CardRoot = styled.div`
  &:not(:last-child) {
    margin-bottom: 1.5rem;
  }
`;

export const CardHeader = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
`;

export const CardCheckbox = styled(CheckBox)`
  height: 1rem;
`;

export const CardLabel = styled.span`
  flex: 1 1 auto;
  margin: 0 0.5rem;
  color: ${color("text-dark")};
  font-weight: bold;
  font-size: 0.875rem;
  min-width: 0;
`;

export const CardIcon = styled(Icon)`
  color: ${color("text-medium")};
  width: 1.125rem;
  height: 1.125rem;
`;

export const CardContent = styled.div`
  margin: 1rem -1.5rem 1rem -1.5rem;
`;
