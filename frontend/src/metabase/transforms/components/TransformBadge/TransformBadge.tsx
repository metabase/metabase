import cx from "classnames";
import { type PropsWithChildren, type Ref, forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { Box, type BoxProps } from "metabase/ui";

export const TransformBadge = forwardRef(function TransformBadge(
  { className, ...rest }: PropsWithChildren<BoxProps>,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Box
      ref={ref}
      c="text-primary"
      fz="sm"
      lh="lg"
      fw="bold"
      bdrs="xs"
      py="xs"
      px="sm"
      className={cx(CS.cursorDefault, className)}
      {...rest}
    />
  );
});
