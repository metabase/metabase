// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Flex, Stack } from "metabase/ui";

const SEARCH_BODY_WIDTH = "90rem";
const SEARCH_SIDEBAR_WIDTH = "18rem";

export const SearchMain = styled(Flex)`
  width: min(calc(${SEARCH_BODY_WIDTH} + ${SEARCH_SIDEBAR_WIDTH}), 100%);
  padding: 1.5rem 1rem;

  ${breakpointMinSmall} {
    padding: 2rem;
  }
` as unknown as typeof Flex;

export const SearchBody = styled(Flex)`
  flex-direction: column;

  ${breakpointMinMedium} {
    flex-direction: row-reverse;
    gap: 2.5rem;
  }
` as unknown as typeof Flex;

export const SearchControls = styled(Stack)`
  overflow: hidden;

  ${breakpointMinMedium} {
    flex: 0 0 ${SEARCH_SIDEBAR_WIDTH};
  }
`;

export const SearchResultContainer = styled.div`
  flex: 1;
`;
