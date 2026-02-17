// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  TableColumn,
  hideResponsively,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import type { ResponsiveProps } from "metabase/common/components/ItemsTable/utils";
import Link from "metabase/common/components/Link";
import { breakpoints } from "metabase/ui/theme";

export const TableRow = styled.tr<{ skeleton?: boolean }>`
  :focus {
    outline: 2px solid var(--mb-color-focus);
  }
  ${(props) =>
    props.skeleton
      ? `
          :hover { background-color: unset ! important; }
          td { cursor: unset ! important; }
        `
      : `cursor: pointer;`}
`;

export const Cell = styled.td<ResponsiveProps>`
  td& {
    padding: 0.25em 0.5rem 0.25em 0.5rem;
  }

  &:focus {
    outline: 2px solid var(--mb-color-focus);

    button,
    a {
      outline: none;
    }
  }

  ${hideResponsively}
`;

export const NameColumn = styled(TableColumn)`
  width: 220px;

  @container ${(props) => props.containerName} (max-width: ${breakpoints.md}) {
    width: 220px;
  }

  @container ${(props) => props.containerName} (max-width: ${breakpoints.sm}) {
    width: 160px;
  }
`;

export const CollectionTableCell = styled(Cell)`
  td& {
    padding: 0;
  }
`;

export const CollectionLink = styled(Link)`
  display: block;
  padding: 1em 0.5em;
  box-sizing: border-box;

  &:hover {
    color: var(--mb-color-icon-brand) !important;
  }
`;
