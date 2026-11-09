import type { DetailViewState } from "metabase/redux/store";
import type { GroupProps } from "metabase/ui";

import { ModelNav } from "./ModelNav";
import { TableNav } from "./TableNav";

interface Props extends GroupProps {
  detailView: DetailViewState;
}

export const Nav = ({ detailView, ...props }: Props) => {
  if (detailView.type === "model") {
    return (
      <ModelNav
        rowName={detailView.rowName}
        card={detailView.card}
        {...props}
      />
    );
  }

  return (
    <TableNav
      rowName={detailView.rowName}
      table={detailView.table}
      {...props}
    />
  );
};
