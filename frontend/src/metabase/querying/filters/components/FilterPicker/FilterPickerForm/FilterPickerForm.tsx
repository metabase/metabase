import type { HTMLAttributes } from "react";

import { Box } from "metabase/ui";

import { MAX_WIDTH, MIN_WIDTH } from "../constants";

import S from "./FilterPickerForm.module.css";

export function FilterPickerForm(props: HTMLAttributes<HTMLFormElement>) {
  return (
    <Box
      className={S.form}
      component="form"
      display="flex"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      mih={0}
      mah="inherit"
      {...props}
    />
  );
}
