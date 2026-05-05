import cx from "classnames";

import { Box, type BoxProps } from "metabase/ui";

import S from "./Dashboard.module.css";

export const FIXED_WIDTH = "1048px";
export const FixedWidthContainer = (
  props: BoxProps & {
    isFixedWidth: boolean;
    children: React.ReactNode;
    id?: string;
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
