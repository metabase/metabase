import React from "react";
import styled from "styled-components";

import Icon from "metabase/components/Icon";
import TextInput from "metabase/components/TextInput";

const SearchInput = styled(TextInput).attrs({
  icon: <Icon name="search" size={16} />,
  borderRadius: "sm",
})`
  min-width: 286px;
`;

export default SearchInput;
