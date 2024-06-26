import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import EntityItem from "metabase/components/EntityItem";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import BaseModelDetailLink from "metabase/models/components/ModelDetailLink";
import type { TextProps } from "metabase/ui";
import { Text, FixedSizeIcon } from "metabase/ui";

import { RawMaybeLink } from "../Badge/Badge.styled";

import type { ResponsiveProps } from "./utils";
import { getContainerQuery } from "./utils";

export const Table = styled.table<{ isInDragLayer?: boolean }>`
  background-color: var(--mb-color-bg-white);
  table-layout: fixed;
  border-collapse: unset;
  border-radius: 0.5rem;
  overflow: hidden;

  thead {
    th {
      border-top: 1px solid var(--mb-color-border);

      &:first-of-type {
        border-start-start-radius: 8px;
        border-inline-start: 1px solid var(--mb-color-border);
      }

      &:last-child {
        border-start-end-radius: 8px;
        border-inline-end: 1px solid var(--mb-color-border);
      }
    }
  }

  ${props => (props.isInDragLayer ? `width: 50vw;` : "")}
`;

Table.defaultProps = { className: AdminS.ContentTable };

export const hideResponsively = ({
  hideAtContainerBreakpoint,
  containerName,
}: ResponsiveProps) =>
  css`
    ${getContainerQuery({
      hideAtContainerBreakpoint,
      containerName,
    })}
  `;

export const ColumnHeader = styled.th<ResponsiveProps>`
  th& {
    padding: 0.75em 1em 0.75em;
  }
  font-weight: bold;
  color: var(--mb-color-text-medium);
  ${hideResponsively}
`;

export const BulkSelectWrapper = styled(IconButtonWrapper)`
  padding-inline: 12px;
  width: 3em;
`;

export const ItemCell = styled.td<ResponsiveProps>`
  padding: 0.25em 0 0.25em 1em !important;
  ${hideResponsively}
`;

export const TableColumn = styled.col<ResponsiveProps>`
  ${hideResponsively}
`;

export const EntityIconCheckBox = styled(EntityItem.IconCheckBox)`
  width: 3em;
  height: 3em;
`;

const itemLinkStyle = css`
  display: flex;
  grid-gap: 0.5rem;
  align-items: center;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const ItemButton = styled(Text)<
  TextProps & HTMLAttributes<HTMLDivElement>
>(itemLinkStyle);

export const ItemLink = styled(Link)(itemLinkStyle);

export const MaybeItemLink = styled(RawMaybeLink)(itemLinkStyle);

export const ItemNameCell = styled.td`
  padding: 0 !important;

  ${ItemLink}, ${MaybeItemLink}, ${ItemButton} {
    padding: 1em;
  }

  &:hover {
    ${ItemLink}, ${MaybeItemLink}, ${ItemButton} {
      color: var(--mb-color-brand);
    }

    cursor: pointer;
  }
`;

export const SortingIcon = styled(FixedSizeIcon)`
  margin-inline-start: 4px;
`;

export const DescriptionIcon = styled(FixedSizeIcon)`
  color: var(--mb-color-text-medium);
`;

SortingIcon.defaultProps = {
  size: 8,
};

export const ModelDetailLink = styled(BaseModelDetailLink)`
  color: var(--mb-color-text-medium);
  visibility: hidden;
`;

export const SortingControlContainer = styled.div<{
  isActive: boolean;
  isSortable?: boolean;
}>`
  display: flex;
  align-items: center;
  color: ${({ isActive }) => isActive && "var(--mb-color-text-dark)"};
  ${props => (props.isSortable ? `cursor: pointer; user-select: none;` : "")}

  .Icon {
    visibility: ${props => (props.isActive ? "visible" : "hidden")};
  }

  &:hover {
    color: var(--mb-color-text-dark);

    .Icon {
      visibility: visible;
    }
  }
`;
SortingControlContainer.defaultProps = { isSortable: true };

export const RowActionsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  span {
    display: flex;
    align-items: center;
  }
`;

export const TableItemSecondaryField = styled.span`
  font-size: 0.95em;
  color: var(--mb-color-text-medium);
`;

export const TBody = styled.tbody`
  td {
    border: none;
    background-color: transparent;

    border-top: 1px solid var(--mb-color-border);

    &:first-of-type {
      border-inline-start: 1px solid var(--mb-color-border);
    }

    &:last-child {
      border-inline-end: 1px solid var(--mb-color-border);
    }
  }

  tr {
    background-color: transparent;
  }

  tr:last-child {
    td {
      border-bottom: 1px solid var(--mb-color-border);

      &:last-child {
        border-end-end-radius: 8px;
      }

      &:first-of-type {
        border-end-start-radius: 8px;
      }
    }
  }

  tr:hover {
    ${ModelDetailLink} {
      visibility: visible;
    }
  }
`;
