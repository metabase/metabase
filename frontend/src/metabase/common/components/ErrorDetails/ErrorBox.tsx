import cx from "classnames";

import { Box, type BoxProps } from "metabase/ui";

import S from "./ErrorDetails.module.css";
import type { ErrorDetails } from "./types";

export const ErrorBox = ({
  children,
  className,
  ...boxProps
}: Omit<BoxProps, "children"> & {
  children: ErrorDetails;
}) => (
  <Box
    className={cx(S.monospace, className)}
    p="lg"
    mt="sm"
    fw="bold"
    bg="background_page-secondary"
    mah="16rem"
    {...boxProps}
  >
    {/* ensure we don't try to render anything except a string */}
    {typeof children === "string"
      ? children
      : typeof children.message === "string"
        ? children.message
        : String(children)}
  </Box>
);
