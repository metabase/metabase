import styled from "@emotion/styled";

import EmptyState from "metabase/components/EmptyState";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Flex, Grid, Icon } from "metabase/ui";

export const BrowseContainer = styled.div`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  margin-top: 1rem;
  container-name: ItemsTableContainer;
  container-type: inline-size;
`;

export const BrowseSection = styled(Flex)`
  max-width: 64rem;
  margin: 0 auto;
  width: 100%;
`;

export const BrowseHeader = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem 2.5rem 3rem 2.5rem;
  color: ${({ theme }) => theme.fn.themeColor("dark")};
`;

export const BrowseMain = styled.main`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  padding: 0 2.5rem;
  padding-bottom: 2rem;
`;

export const BrowseGrid = styled(Grid)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 0 1rem;
  margin: 0;
  width: 100%;

  ${breakpointMinSmall} {
    padding-bottom: 2.5rem;
  }
  ${breakpointMinMedium} {
    padding-bottom: 3rem;
  }
`;

export const CenteredEmptyState = styled(EmptyState)`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

export const LearnAboutDataIcon = styled(Icon)`
  min-width: 14px;
  min-height: 14px;
`;
