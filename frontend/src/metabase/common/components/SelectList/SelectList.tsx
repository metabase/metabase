import { type HTMLProps, forwardRef } from "react";

import { Box, type BoxProps } from "metabase/ui";

import { BaseSelectListItem } from "./BaseSelectListItem";
import { SelectListItem } from "./SelectListItem";

type SelectListProps = Omit<HTMLProps<HTMLUListElement>, "role"> & BoxProps;

const SelectList = forwardRef<HTMLUListElement, SelectListProps>(
  function SelectList(props: SelectListProps, ref) {
    return (
      <Box
        {...props}
        ref={ref}
        role="menu"
        data-testid="select-list"
        component="ul"
      />
    );
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SelectList, {
  BaseItem: BaseSelectListItem,
  Item: SelectListItem,
});
