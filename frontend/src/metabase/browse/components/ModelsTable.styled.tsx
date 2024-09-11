import styled from "@emotion/styled";

import {
  ItemLink,
  hideResponsively,
  TableColumn,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { breakpoints } from "metabase/ui/theme";

export const ModelTableRow = styled.tr<{ skeleton?: boolean }>`
  :focus {
    outline: 2px solid var(--mb-color-focus);
  }
  ${props =>
    props.skeleton
      ? `
    :hover { background-color: unset ! important; }
    td { cursor: unset ! important; }
    `
      : `cursor: pointer;`}
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

export const ActionSpan = styled.span<{ isDone: boolean }>`
  background: ${props =>
    props.isDone
      ? "#CFE6C9 !important"
      : "#D3D8F4 !important"}; /* Green for Done, Purple for Pending */
  color: ${props =>
    props.isDone ? "#29920E" : "#4D62D2"}; /* Darker text color for contrast */
  padding: 0.5rem 1rem;
  text-align: center;
  border-radius: 99px; /* Full border radius */
  display: inline-block;
`;
