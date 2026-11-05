import type { ReactNode } from "react";

import S from "./DocTable.module.css";

type DocTableProps = {
  columns: string[];
  rows: ReactNode[][];
};

/** A plain reference table: bold first column, one line per row. */
export function DocTable({ columns, rows }: DocTableProps) {
  return (
    <table className={S.table}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, rowIndex) => (
          <tr key={rowIndex}>
            {cells.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
