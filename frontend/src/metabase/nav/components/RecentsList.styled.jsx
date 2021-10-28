import styled from "styled-components";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const EmptyStateContainer = styled.div`
  margin: 3rem 0;
`;

export const Header = styled.h4`
  padding: 0.5rem 1rem;
`;

export const RecentListItemContent = styled.div`
  display: flex;
  align-items: flex-start;
`;

export const RecentListItemSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: flex-end;
  margin-left: ${space(1)};
  color: ${color("brand")};
`;
