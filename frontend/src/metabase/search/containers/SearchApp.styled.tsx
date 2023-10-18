import styled from "@emotion/styled";
import { SearchSidebar } from "metabase/search/components/SearchSidebar";
import { SearchOutput } from "metabase/search/containers/SearchOutput";
import { breakpointMinMedium } from "metabase/styled-components/theme";
import type { TextProps, BoxProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

const SEARCH_BODY_WIDTH = "90rem";
const SEARCH_SIDEBAR_WIDTH = "18rem";
const GRID_AREA_HEADER = "header";
const GRID_AREA_CONTROLS = "controls";
const GRID_AREA_BODY = "body";

export const SearchHeader = styled(Text)<TextProps>`
  grid-area: ${GRID_AREA_HEADER};
`;

export const SearchControls = styled(SearchSidebar)`
  grid-area: ${GRID_AREA_CONTROLS};
`;

export const SearchBody = styled(SearchOutput)`
  grid-area: ${GRID_AREA_BODY};
`;

export const SearchContainer = styled(Box)<BoxProps>`
  display: grid;
  grid-template-areas: "${GRID_AREA_HEADER}" "${GRID_AREA_CONTROLS}" "${GRID_AREA_BODY}";
  justify-content: center;

  grid-template-columns: 1fr;
  grid-template-rows: auto auto 1fr;

  overflow: hidden auto;

  gap: ${({ theme }) => theme.spacing.xl};
  padding: 2.5rem 2.75rem ;

  ${breakpointMinMedium} {
    grid-template-columns: minmax(auto, ${SEARCH_BODY_WIDTH}) ${SEARCH_SIDEBAR_WIDTH};
    grid-template-areas: "${GRID_AREA_HEADER} ${GRID_AREA_HEADER}" "${GRID_AREA_BODY} ${GRID_AREA_CONTROLS}";
    grid-template-rows: auto 1fr;
  }
}`;
