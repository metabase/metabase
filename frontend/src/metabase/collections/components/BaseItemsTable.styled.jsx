import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { breakpointMaxMedium } from "metabase/styled-components/theme/media-queries";

import EntityItem from "metabase/components/EntityItem";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

const LAST_EDITED_BY_INDEX = 3;
const LAST_EDITED_AT_INDEX = 4;

export const Table = styled.table.attrs({ className: "ContentTable" })`
  table-layout: fixed;

  ${breakpointMaxMedium} {
    & td:nth-child(${LAST_EDITED_BY_INDEX}),
    th:nth-child(${LAST_EDITED_BY_INDEX}),
    col:nth-child(${LAST_EDITED_BY_INDEX}),
    td:nth-child(${LAST_EDITED_AT_INDEX}),
    th:nth-child(${LAST_EDITED_AT_INDEX}),
    col:nth-child(${LAST_EDITED_AT_INDEX}) {
      display: none;
    }
  }
`;

export const ColumnHeader = styled.th`
  font-weight: bold;
  color: ${color("text-light")};
`;

export const EntityIconCheckBox = styled(EntityItem.IconCheckBox)`
  width: 3em;
  height: 3em;
`;

export const ItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;

export const SortingIcon = styled(Icon).attrs({
  size: 8,
})`
  margin-left: 4px;
`;

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

export const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
  color: ${color("text-dark")};
`;
