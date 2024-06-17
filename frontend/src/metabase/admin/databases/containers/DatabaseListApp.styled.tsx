import styled from "@emotion/styled";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { space } from "metabase/styled-components/theme";

export const TableCellContent = styled.div`
  display: flex;
  align-items: center;
`;

export const TableCellSpinner = styled(LoadingSpinner)`
  color: var(--mb-color-brand);
  margin-right: ${space(1)};
`;

export const AddSampleDatabaseLink = styled.a`
  color: var(--mb-color-text-light);
  text-decoration: none;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
