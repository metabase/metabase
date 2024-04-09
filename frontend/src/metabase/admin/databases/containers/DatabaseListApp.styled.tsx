import styled from "@emotion/styled";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const TableCellContent = styled.div`
  display: flex;
  align-items: center;
`;

export const TableCellSpinner = styled(LoadingSpinner)`
  color: ${color("brand")};
  margin-right: ${space(1)};
`;

export const AddSampleDatabaseLink = styled.a`
  color: ${color("text-light")};
  text-decoration: none;

  &:hover {
    color: ${color("brand")};
  }
`;
