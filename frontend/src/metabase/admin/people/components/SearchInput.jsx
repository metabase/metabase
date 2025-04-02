// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Input from "metabase/core/components/Input";
import { Icon } from "metabase/ui";

const SearchInput = styled(props => (
  <Input
    {...props}
    icon={props.icon ?? <Icon name="search" size={16} />}
    borderRadius={props.borderRadius ?? "sm"}
  />
))`
  min-width: 286px;
`;

export default SearchInput;
