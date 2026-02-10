import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Text, type TextProps } from "metabase/ui";

type LabelProps = TextProps & {
  children?: ReactNode;
};

export const Label = ({ children, className, ...props }: LabelProps) => (
  <Text
    className={cx(CS.mb2, className)}
    c="text-primary"
    fz="14px"
    fw={700}
    {...props}
  >
    {children}
  </Text>
);
