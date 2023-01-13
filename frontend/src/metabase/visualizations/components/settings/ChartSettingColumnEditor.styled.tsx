import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import CheckBox from "metabase/core/components/CheckBox";
import Link from "metabase/core/components/Link";

export const TableName = styled.p`
  text-transform: uppercase;
  color: ${color("text-medium")};
  display: inline-block;
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

export const FieldBulkActionLink = styled(Link)`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: 700;
`;
