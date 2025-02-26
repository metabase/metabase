import cx from "classnames";
import { forwardRef } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./FullWidthContainer.module.css";

export const FullWidthContainer = forwardRef<
  HTMLDivElement,
  BoxProps & { children: React.ReactNode }
>(function FullWidthContainer(props, ref) {
  const { className, ...rest } = props;

  return (
    <Box className={cx(S.FullWidthContainer, className)} {...rest} ref={ref} />
  );
});
