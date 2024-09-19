import type { ReactNode } from "react";

import AdminS from "metabase/css/admin.module.css";

interface AdminContentTableProps {
  columnTitles: ReactNode[];
  children: ReactNode;
}

const AdminContentTable = ({
  columnTitles,
  children,
}: AdminContentTableProps) => (
  <table data-testid="admin-content-table" className={AdminS.ContentTable}>
    <thead>
      <tr>
        {columnTitles &&
          columnTitles.map((title, index) => <th key={index}>{title}</th>)}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AdminContentTable;
