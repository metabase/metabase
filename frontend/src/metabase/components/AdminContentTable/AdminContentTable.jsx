import AdminS from "metabase/css/admin.module.css";

/* eslint-disable react/prop-types */
const AdminContentTable = ({ columnTitles, children }) => (
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
