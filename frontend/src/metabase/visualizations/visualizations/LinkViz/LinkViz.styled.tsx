import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";
import RecentsList from "metabase/nav/components/RecentsList";

export const DisplayLinkCardWrapper = styled.div`
  padding: 0.5rem;
  display: flex;
  width: 100%;
  height: 100%;
  pointer-events: all;
  align-items: center;
`;

export const EditLinkCardWrapper = styled.div`
  padding: 0.5rem 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
  pointer-events: all;
`;

export const CardLink = styled(Link)`
  width: 100%;
  padding: 0.5rem;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  gap: 0.5rem;
  align-items: center;
  font-weight: bold;

  &:hover {
    color: ${color("brand")};
  }
`;

export const BrandIconWithHorizontalMargin = styled(Icon)`
  color: ${color("brand")};
  margin: 0 0.5rem;
`;

const searchResultsStyles = `
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  min-width: 20rem;
  overflow-y: auto;

  background-color: ${color("bg-white")};
  line-height: 24px;

  max-height: 400px;

  border: 1px solid ${color("border")};
  border-radius: 6px;
  box-shadow: 0 7px 20px ${color("shadow")};
  pointer-events: all;
`;

export const SearchResultsContainer = styled.div`
  ${searchResultsStyles}
`;

export const StyledRecentsList = styled(RecentsList)`
  ${searchResultsStyles}
`;
