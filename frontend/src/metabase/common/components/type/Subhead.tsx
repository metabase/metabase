import type { ComponentProps } from "react";

import { Text } from "metabase/common/components/type/Text";

type SubheadProps = ComponentProps<typeof Text>;

export const Subhead = ({ children, ...props }: SubheadProps) => (
  <Text color="dark" {...props} fontSize="18px" fontWeight={700}>
    {children}
  </Text>
);
