import cx from "classnames";
import * as React from "react";
import { type Ref, forwardRef, useMemo } from "react";
import reactAnsiStyle from "react-ansi-style";

import {
  Box,
  type BoxComponentProps,
  type BoxProps,
  type PolymorphicComponentProps,
} from "metabase/ui";

import S from "./AnsiLogs.module.css";

type LogOutputProps<C> = PolymorphicComponentProps<C, BoxComponentProps> &
  BoxProps & {
    children?: string;
  };

export const AnsiLogs = forwardRef(function AnsiLogsInner<C = "div">(
  props: LogOutputProps<C>,
  ref: Ref<HTMLDivElement>,
) {
  const { children, className, ...rest } = props;
  const displayContent = useMemo(
    () => reactAnsiStyle(React, children ?? ""),
    [children],
  );

  return (
    // @ts-expect-error: it's very hard to type the ref and component props from mantine
    <Box ref={ref} className={cx(S.ansiLogs, className)} {...rest}>
      {displayContent}
    </Box>
  );
});
