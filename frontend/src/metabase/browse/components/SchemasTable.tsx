import React, { useMemo, useState, useCallback } from "react";
import { t } from "ttag";
import cx from "classnames";
import * as Urls from "metabase/lib/urls";
import type { CollectionItem } from "metabase-types/api";
import CS from "metabase/css/core/index.css";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import {
  Root,
  SortIcon,
  Table,
  TableContainer,
  TableHeaderCellContent,
} from "metabase/visualizations/components/TableSimple/TableSimple.styled";

interface SchemasTableProps {
  schemas: any[];
}

export const SchemasTable = ({ schemas }: SchemasTableProps) => {
  // State for sorting
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Extract tables from schemas and flatten them into a single array
  const tables = useMemo(
    () =>
      schemas.flatMap(schema =>
        schema.tables.map((table: any) => ({
          ...table,
          schemaName: schema.name, // Add schema name for reference
        })),
      ),
    [schemas],
  );

  // Prepare columns
  const columns = useMemo(
    () => [
      { name: "display_name", display_name: t`Display Name` },
      { name: "schemaName", display_name: t`Schema Name` },
      { name: "created_at", display_name: t`Created At` },
      { name: "updated_at", display_name: t`Updated At` },
    ],
    [],
  );

  // Prepare sorted rows
  const sortedRows = useMemo(() => {
    let sortedTables = [...tables];
    if (sortColumn !== null) {
      const columnName = columns[sortColumn].name;
      sortedTables.sort((a: any, b: any) => {
        const aValue = a[columnName]?.toString().toLowerCase() || "";
        const bValue = b[columnName]?.toString().toLowerCase() || "";
        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortedTables;
  }, [tables, sortColumn, sortDirection, columns]);

  // Column header click handler for sorting
  const handleSort = useCallback(
    (colIndex: number) => {
      if (sortColumn === colIndex) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colIndex);
        setSortDirection("asc");
      }
    },
    [sortColumn],
  );

  // Render column headers
  const renderColumnHeader = (
    col: { name: string; display_name: string },
    colIndex: number,
  ) => {
    const iconName = sortDirection === "desc" ? "chevrondown" : "chevronup";
    return (
      <th key={colIndex} onClick={() => handleSort(colIndex)}>
        <TableHeaderCellContent
          isSorted={colIndex === sortColumn}
          isRightAligned={false}
        >
          <Ellipsified>{col.display_name}</Ellipsified>
          {colIndex === sortColumn && <SortIcon name={iconName} />}
        </TableHeaderCellContent>
      </th>
    );
  };

  // Render rows
  const renderRow = (table: any, rowIndex: number) => (
    <tr
      key={table.id}
      onClick={() => console.log("Clicked on table:", table)}
      className="cursor-pointer"
      data-testid="table-row"
    >
      <td>{table.display_name}</td>
      <td>{table.schemaName}</td>
      <td>{new Date(table.created_at).toLocaleDateString()}</td>
      <td>{new Date(table.updated_at).toLocaleDateString()}</td>
    </tr>
  );

  return (
    <TableContainer className={cx(CS.scrollShow, CS.scrollShowHover)}>
      <Table>
        <thead>
          <tr>{columns.map(renderColumnHeader)}</tr>
        </thead>
        <tbody>{sortedRows.map(renderRow)}</tbody>
      </Table>
    </TableContainer>
  );
};
