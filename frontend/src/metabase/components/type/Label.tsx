/* eslint-disable react/prop-types */
import Text from "metabase/components/type/Text";
import CS from "metabase/css/core/index.css";
import { PropsWithChildren } from "react";

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

export default Label;
