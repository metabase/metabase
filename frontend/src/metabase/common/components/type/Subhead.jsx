/* eslint-disable react/prop-types */
import { Text } from "metabase/common/components/type/Text";

export const Subhead = ({ children, ...props }) => (
  <Text mb="4px" color="dark" {...props} fontSize="18px" fontWeight={700}>
    {children}
  </Text>
);
