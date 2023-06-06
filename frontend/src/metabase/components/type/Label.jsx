/* eslint-disable react/prop-types */
import Text from "metabase/components/type/Text";

const Label = ({ children, ...props }) => (
  <Text
    className="mb2"
    color="dark"
    {...props}
    fontSize="14px"
    fontWeight={700}
  >
    {children}
  </Text>
);

export default Label;
