import React, { forwardRef } from "react";

import { BaseSelectListItem } from "./BaseSelectListItem";
import { SelectListItem } from "./SelectListItem";

type SelectListProps = Omit<React.HTMLProps<HTMLUListElement>, "role">;

const SelectList = forwardRef<HTMLUListElement, SelectListProps>(
  function SelectList(props: SelectListProps, ref) {
    return <ul {...props} ref={ref} role="menu" data-testid="select-list" />;
  },
);

export default Object.assign(SelectList, {
  BaseItem: BaseSelectListItem,
  Item: SelectListItem,
});
