import type { ComponentProps } from "react";

import { Text } from "metabase/common/components/type/Text";
import CS from "metabase/css/core/index.css";

type LabelProps = ComponentProps<typeof Text>;

export const Label = ({ children, ...props }: LabelProps) => (
  <Text
    className={CS.mb2}
    color="dark"
    {...props}
    fontSize="14px"
    fontWeight={700}
  >
    {children}
  </Text>
);
