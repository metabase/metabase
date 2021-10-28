import styled from "styled-components";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

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
  align-self: center;
  margin-left: auto;
  color: ${color("brand")};
`;
