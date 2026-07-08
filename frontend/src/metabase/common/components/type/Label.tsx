import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Text, type TextProps } from "metabase/ui";

type LabelProps = TextProps & {
  children?: ReactNode;
};

export const Label = ({ children, ...props }: LabelProps) => (
  <Text className={CS.mb2} c="text-primary" {...props} fz="14px" fw={700}>
    {children}
  </Text>
);
