import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import CheckBox from "metabase/core/components/CheckBox";

export const TableName = styled.p`
  text-transform: uppercase;
  color: ${color("text-medium")};
  display: inline-block;
  font-weight: 700;
`;

export const TableHeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
`;

export const FieldCheckbox = styled(CheckBox)`
  ${CheckBox.Label} {
    font-weight: 700;
  }
  margin-bottom: 0.5rem;
`;
