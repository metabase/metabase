import AdminS from "metabase/css/admin.module.css";

export const AdminContentTable = ({
  columnTitles,
  children,
}: {
  columnTitles: string[];
  children: React.ReactNode;
}) => (
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
