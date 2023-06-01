import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";
import Input from "metabase/core/components/Input";

const SearchInput = styled(Input)`
  min-width: 286px;
`;

SearchInput.defaultProps = {
  icon: <Icon name="search" size={16} />,
  borderRadius: "sm",
};

export default SearchInput;
