import { forwardRef } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./FullWidthContainer.module.css";

export const FullWidthContainer = forwardRef<
  HTMLDivElement,
  BoxProps & { children?: React.ReactNode }
>(function FullWidthContainer(props, ref) {
  return (
    <Box
      ref={ref}
      w="100%"
      px="md"
      m="0 auto"
      className={S.FullWidthContainer}
      {...props}
    />
  );
});
