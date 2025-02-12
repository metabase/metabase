import styled from "@emotion/styled";

import Input from "metabase/core/components/Input";

export const SearchInput = styled(Input)`
  width: 100%;

  ${Input.Field} {
    border-radius: 0;
    outline: none;
  }
`;
