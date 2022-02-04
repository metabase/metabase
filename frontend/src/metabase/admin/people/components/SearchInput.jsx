import React from "react";
import styled from "styled-components";

import Icon from "metabase/components/Icon";
import TextInput from "metabase/components/TextInput";

const SearchInput = styled(TextInput)`
  min-width: 286px;
`;

SearchInput.defaultProps = {
  icon: <Icon name="search" size={16} />,
  borderRadius: "sm",
};

export default SearchInput;
