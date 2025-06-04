/* eslint-disable react/prop-types */
import Text from "metabase/components/type/Text";
import CS from "metabase/css/core/index.css";

const Label = ({ children, ...props }) => (
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
