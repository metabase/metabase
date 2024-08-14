import styled from "@emotion/styled";

import Input from "metabase/core/components/Input";
import { Icon } from "metabase/ui";

const SearchInput = styled(Input)`
  min-width: 286px;
`;

SearchInput.defaultProps = {
  icon: <Icon name="search" size={16} />,
  borderRadius: "sm",
};

export default SearchInput;
