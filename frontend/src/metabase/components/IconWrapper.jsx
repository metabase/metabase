import { Flex } from "grid-styled";
import colors from "metabase/lib/colors";

const IconWrapper = Flex.extend`
  background: ${props => colors["bg-light"]};
  border-radius: 6px;
`;

export default IconWrapper;
