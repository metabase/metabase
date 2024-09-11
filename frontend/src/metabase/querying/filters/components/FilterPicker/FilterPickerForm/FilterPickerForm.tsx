import { type HTMLAttributes, type Ref, forwardRef } from "react";

import { Box } from "metabase/ui";

import { MAX_WIDTH, MIN_WIDTH } from "../constants";

export const FilterPickerForm = forwardRef(function FilterPickerForm(
  props: HTMLAttributes<HTMLFormElement>,
  ref: Ref<HTMLFormElement>,
) {
  return (
    <Box
      ref={ref}
      {...props}
      component="form"
      display="flex"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      mih={0}
      mah="inherit"
      style={{ flexDirection: "column" }}
    />
  );
});
