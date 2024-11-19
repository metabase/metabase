import styled from "@emotion/styled";

import type { TextInputProps } from "metabase/ui";
import { Flex, TextInput } from "metabase/ui";

export const SearchInputContainer = styled(Flex)`
  flex-grow: 1;
`;

interface SearchInputProps extends TextInputProps {
  isActive: boolean;
}

export const SearchInput = styled(TextInput)<SearchInputProps>`
  width: ${props => (props.isActive ? "20rem" : "1.75rem")};
  transition: width 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
