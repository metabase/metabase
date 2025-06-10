import cx from "classnames";
import type { ReactNode } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./Dashboard.module.css";

export const FIXED_WIDTH = "1048px";
export const FixedWidthContainer = (
  props: BoxProps & {
    isFixedWidth: boolean;
    children: ReactNode;
    id?: string;
    // TODO: Find a better typing for this from Mantine
    component?: any;
  },
) => {
  const { isFixedWidth, className, ...rest } = props;

  return (
    <Box
      w="100%"
      className={cx(
        S.FixedWidthContainer,
        { [S.isFixedWidth]: isFixedWidth },
        className,
      )}
      style={{
        "--dashboard-fixed-width": FIXED_WIDTH,
      }}
      {...rest}
    />
  );
};
