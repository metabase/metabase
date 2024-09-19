import type { PropsWithChildren } from "react";

import Text from "metabase/components/type/Text";
import CS from "metabase/css/core/index.css";

const Label = ({ children, ...props }: PropsWithChildren) => (
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Label;
