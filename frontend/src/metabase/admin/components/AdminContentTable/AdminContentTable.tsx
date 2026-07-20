import cx from "classnames";
import type { ReactNode } from "react";

import AdminS from "metabase/css/admin.module.css";

export const AdminContentTable = ({
  columnTitles,
  children,
  className,
}: {
  columnTitles: ReactNode[];
  children: ReactNode;
  className?: string;
}) => (
  <table
    data-testid="admin-content-table"
    className={cx(AdminS.ContentTable, className)}
  >
    <thead>
      <tr>
        {columnTitles &&
          columnTitles.map((title, index) => <th key={index}>{title}</th>)}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);
