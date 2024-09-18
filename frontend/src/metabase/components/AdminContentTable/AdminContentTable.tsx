import AdminS from "metabase/css/admin.module.css";
import { ReactNode } from "react";

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

export default AdminContentTable;
