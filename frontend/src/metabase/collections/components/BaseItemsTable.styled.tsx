import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxMedium,
  breakpointMinLarge,
} from "metabase/styled-components/theme/media-queries";

import EntityItem from "metabase/components/EntityItem";
import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";
import BaseModelDetailLink from "metabase/models/components/ModelDetailLink";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

const LAST_EDITED_BY_INDEX = 3;
const LAST_EDITED_AT_INDEX = 4;

export const Table = styled.table<{ canSelect: boolean }>`
  background-color: ${color("white")};
  table-layout: fixed;
  border-collapse: unset;

  thead {
    th {
      border-top: 1px solid ${color("border")};

      &:first-of-type {
        border-top-left-radius: 8px;
        border-left: 1px solid ${color("border")};
      }

      &:last-child {
        border-top-right-radius: 8px;
        border-right: 1px solid ${color("border")};
      }
    }
  }

  ${props => {
    const offset = props.canSelect ? 1 : 0;
    const offsetEditedByIndex = LAST_EDITED_BY_INDEX + offset;
    const offsetEditedAtIndex = LAST_EDITED_AT_INDEX + offset;

    return `
      ${breakpointMaxMedium} {
        & td:nth-of-type(${offsetEditedByIndex}),
        th:nth-of-type(${offsetEditedByIndex}),
        col:nth-of-type(${offsetEditedByIndex}),
        td:nth-of-type(${offsetEditedAtIndex}),
        th:nth-of-type(${offsetEditedAtIndex}),
        col:nth-of-type(${offsetEditedAtIndex}) {
          display: none;
        }
      }
    `;
  }}
`;

Table.defaultProps = { className: "ContentTable" };

export const ColumnHeader = styled.th`
  padding: 1em 1em 0.75em !important;
  font-weight: bold;
  color: ${color("text-medium")};
`;

export const BulkSelectWrapper = styled(IconButtonWrapper)`
  padding-left: 12px;
  padding-right: 12px;
  width: 3em;
`;

export const LastEditedByCol = styled.col`
  width: 140px;

  ${breakpointMinLarge} {
    width: 240px;
  }
`;

export const ItemCell = styled.td`
  padding: 0.25em 0 0.25em 1em !important;
`;

export const EntityIconCheckBox = styled(EntityItem.IconCheckBox)`
  width: 3em;
  height: 3em;
`;

export const ItemLink = styled(Link)`
  display: flex;
  grid-gap: 0.5rem;
  align-items: center;

  &:hover {
    color: ${color("brand")};
  }
`;

export const ItemNameCell = styled.td`
  padding: 0 !important;

  ${ItemLink} {
    padding: 1em;
  }
  &:hover {
    ${ItemLink} {
      color: ${color("brand")};
    }
    cursor: pointer;
  }
`;

export const SortingIcon = styled(Icon)`
  margin-left: 4px;
`;

export const DescriptionIcon = styled(Icon)`
  color: ${color("text-medium")};
`;

SortingIcon.defaultProps = {
  size: 8,
};

export const ModelDetailLink = styled(BaseModelDetailLink)`
  color: ${color("text-medium")};
  visibility: hidden;
`;

export const SortingControlContainer = styled.div<{ isActive: boolean }>`
  display: flex;
  align-items: center;
  color: ${props => (props.isActive ? color("text-dark") : "")};
  cursor: pointer;
  user-select: none;
  .Icon {
    visibility: ${props => (props.isActive ? "visible" : "hidden")};
  }
  &:hover {
    color: ${color("text-dark")};
    .Icon {
      visibility: visible;
    }
  }
`;

export const RowActionsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
`;

export const TableItemSecondaryField = styled.span`
  font-size: 0.95em;
  color: ${color("text-medium")};
`;

export const TBody = styled.tbody`
  td {
    border: none;
    background-color: transparent;

    border-top: 1px solid ${color("border")};

    &:first-of-type {
      border-left: 1px solid ${color("border")};
    }

    &:last-child {
      border-right: 1px solid ${color("border")};
    }
  }

  tr {
    background-color: transparent;
  }

  tr:last-child {
    td {
      border-bottom: 1px solid ${color("border")};

      &:last-child {
        border-bottom-right-radius: 8px;
      }

      &:first-of-type {
        border-bottom-left-radius: 8px;
      }
    }
  }

  tr:hover {
    ${ModelDetailLink} {
      visibility: visible;
    }
  }
`;
