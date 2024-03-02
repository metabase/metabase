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

  ${breakpointMinSmall} {
    padding: 2rem;
  }
`;

export const SearchBody = styled(Flex)`
  ${breakpointMinMedium} {
    flex-direction: row-reverse;
    gap: 2.5rem;
  }
`;

export const SearchControls = styled(Stack)`
  overflow: hidden;

  ${breakpointMinMedium} {
    flex: 0 0 ${SEARCH_SIDEBAR_WIDTH};
  }
`;

export const SearchResultContainer = styled.div`
  flex: 1;
`;
