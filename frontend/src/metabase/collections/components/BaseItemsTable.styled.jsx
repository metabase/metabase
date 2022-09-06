import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxMedium,
  breakpointMinLarge,
} from "metabase/styled-components/theme/media-queries";

import EntityItem from "metabase/components/EntityItem";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";

const LAST_EDITED_BY_INDEX = 3;
const LAST_EDITED_AT_INDEX = 4;

export const Table = styled.table`
  table-layout: fixed;
  border-collapse: unset;

  ${breakpointMaxMedium} {
    & td:nth-of-type(${LAST_EDITED_BY_INDEX}),
    th:nth-of-type(${LAST_EDITED_BY_INDEX}),
    col:nth-of-type(${LAST_EDITED_BY_INDEX}),
    td:nth-of-type(${LAST_EDITED_AT_INDEX}),
    th:nth-of-type(${LAST_EDITED_AT_INDEX}),
    col:nth-of-type(${LAST_EDITED_AT_INDEX}) {
      display: none;
    }
  }
`;

Table.defaultProps = { className: "ContentTable" };

export const ColumnHeader = styled.th`
  padding: 1em 1em 0.75em !important;
  font-weight: bold;
  color: ${color("text-medium")};
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

export const SortingIcon = styled(Icon)`
  margin-left: 4px;
`;

export const DescriptionIcon = styled(Icon)`
  color: ${color("text-medium")};
`;

SortingIcon.defaultProps = {
  size: 8,
};

export const SortingControlContainer = styled.div`
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

export const TableItemSecondaryField = styled.span`
  font-size: 0.95em;
  color: ${color("text-medium")};
`;

export const TBody = styled.tbody`
  background-color: ${color("white")};

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

  tr:first-of-type {
    td:first-of-type {
      border-top-left-radius: 8px;
    }

    td:last-child {
      border-top-right-radius: 8px;
    }
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
`;
