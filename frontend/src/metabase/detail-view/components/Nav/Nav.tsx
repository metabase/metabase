import type { ReactNode } from "react";

import type { Table } from "metabase-types/api";
import type { GroupProps } from "metabase/ui";

import { ModelNav } from "./ModelNav";
import { TableNav } from "./TableNav";

interface Props extends GroupProps {
  rowName: ReactNode;
  table: Table;
}

export const Nav = (props: Props) => {
  const { table } = props;

  if (table.type === "model") {
    return <ModelNav {...props} />;
  }

  return <TableNav {...props} />;
};
