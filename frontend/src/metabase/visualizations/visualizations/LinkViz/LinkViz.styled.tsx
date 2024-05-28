import styled from "@emotion/styled";

import BaseExternalLink from "metabase/core/components/ExternalLink";
import Input from "metabase/core/components/Input";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { RecentsList } from "metabase/nav/components/search/RecentsList";
import { Icon } from "metabase/ui";

export const DisplayLinkCardWrapper = styled.div<{ fade?: boolean }>`
  padding: 0 0.5rem;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  pointer-events: ${({ fade }) => (fade ? "none" : "all")};
  opacity: ${({ fade }) => (fade ? 0.25 : 1)};
`;

export const EditLinkCardWrapper = styled.div<{ fade?: boolean }>`
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
  pointer-events: ${({ fade }) => (fade ? "none" : "all")};
  opacity: ${({ fade }) => (fade ? 0.25 : 1)};
`;

export const CardLink = styled(Link)`
  width: 100%;
  padding: 0 0.5rem;
  display: flex;
  height: 100%;
  min-width: 0;
  gap: 0.5rem;
  align-items: center;
  font-weight: bold;

  &:hover {
    color: ${color("brand")};
  }
`;

export const ExternalLink = styled(BaseExternalLink)`
  width: 100%;
  padding: 0 0.5rem;
  display: flex;
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

export const StyledInput = styled(Input)`
  pointer-events: all;

  * {
    pointer-events: all;
  }
`;
