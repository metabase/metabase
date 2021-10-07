/* eslint-disable react/prop-types */
import React from "react";

type Props = {
  columnTitles: string[];
  children: React.ReactNode;
}

const AdminContentTable: React.FC<Props> = ({ columnTitles, children }) => (
  <table className="ContentTable">
    <thead>
      <tr>
        {columnTitles &&
          columnTitles.map((title, index) => <th key={index}>{title}</th>)}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

export default AdminContentTable;
