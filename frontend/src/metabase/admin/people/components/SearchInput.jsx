import { styled } from "metabase/ui/utils";

import { Icon } from "metabase/core/components/Icon";
import Input from "metabase/core/components/Input";

const SearchInput = styled(Input)`
  min-width: 286px;
`;

SearchInput.defaultProps = {
  icon: <Icon name="search" size={16} />,
  borderRadius: "sm",
};

export default SearchInput;
