import CS from "metabase/css/admin.module.css";
import cx from "classnames";

/* eslint-disable react/prop-types */
const AdminContentTable = ({ columnTitles, children }) => (
  <table data-testid="admin-content-table" className={cx(CS.ContentTable)}>
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
