/* eslint-disable react/prop-types */
import { Text } from "metabase/common/components/type/Text";
import CS from "metabase/css/core/index.css";

export const Label = ({ children, ...props }) => (
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
