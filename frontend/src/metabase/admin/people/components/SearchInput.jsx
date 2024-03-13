import styled from "@emotion/styled";

import Input from "metabase/core/components/Input";
import { Icon } from "metabase/ui";

const SearchInput = styled(Input)`
  & input {
    min-width: 17rem;
  }
  margin-inline-end: 1rem;
`;

SearchInput.defaultProps = {
  icon: <Icon name="search" size={16} />,
  borderRadius: "sm",
};

export default SearchInput;
