import styled from "@emotion/styled";
import { Flex, TextInput } from "metabase/ui";

export const SearchInputContainer = styled(Flex)`
  flex-grow: 1;
`;

export const SearchInput = styled(TextInput)`
  width: 1.75rem;
  transition: width 0.2s;

  &:focus-within {
    width: 20rem;
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
