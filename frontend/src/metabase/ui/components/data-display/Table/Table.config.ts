import { Table } from "@mantine/core";

import TableStyles from "./Table.module.css";

export const tableOverrides = {
  Table: Table.extend({
    classNames: {
      table: TableStyles.table,
      thead: TableStyles.thead,
      th: TableStyles.th,
      tr: TableStyles.tr,
      td: TableStyles.td,
    },
  }),
};
