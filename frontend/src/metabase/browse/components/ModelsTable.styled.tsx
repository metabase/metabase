import styled from "@emotion/styled";

import {
  ItemLink,
  TableColumn,
  hideResponsively,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { color } from "metabase/lib/colors";
import { breakpoints } from "metabase/ui/theme";

export const ModelTableRow = styled.tr`
  cursor: pointer;

  :focus {
    outline: 2px solid ${color("focus")};
  }
`;

export const ModelNameLink = styled(ItemLink)`
  padding-inline-start: 0.6rem;
  padding-block: 0.5rem;
`;

export const ModelCell = styled.td<ResponsiveProps>`
  td& {
    padding: 0.25em 0.5rem 0.25em 0.5rem;
  }
  ${hideResponsively}
`;

export const ModelNameColumn = styled(TableColumn)`
  width: 356px;

  @container ${props => props.containerName} (max-width: ${breakpoints.md}) {
    width: 280px;
  }

  @container ${props => props.containerName} (max-width: ${breakpoints.sm}) {
    width: 200px;
  }
`;
