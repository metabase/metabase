import styled from "@emotion/styled";
import {
  breakpointMinLarge,
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Flex } from "metabase/ui";

const SEARCH_BODY_WIDTH = "90rem";
const SEARCH_SIDEBAR_WIDTH = "240px";

export const SearchMain = styled(Flex)`
  padding: 1.5rem 1rem;
  margin: auto;
  width: min(calc(${SEARCH_BODY_WIDTH} + ${SEARCH_SIDEBAR_WIDTH}), 100%);

  ${breakpointMinSmall} {
    padding: 2rem;
  }

  ${breakpointMinMedium} {
    padding: 2rem 3rem;
  }

  ${breakpointMinLarge} {
    padding: 2rem 4rem;
  }
`;

export const SearchBody = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;

  ${breakpointMinMedium} {
    flex-direction: row-reverse;
    gap: 2.5rem;
  }
`;

export const SearchControls = styled.div`
  ${breakpointMinMedium} {
    flex: 0 0 240px;
  }
`;

export const SearchResultContainer = styled.div`
  flex: 1;
`;
