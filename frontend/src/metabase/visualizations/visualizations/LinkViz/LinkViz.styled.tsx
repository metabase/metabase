// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import BaseExternalLink from "metabase/common/components/ExternalLink";
import Input from "metabase/common/components/Input";
import Link from "metabase/common/components/Link";
import { RecentsList } from "metabase/nav/components/search/RecentsList";

export const DisplayLinkCardWrapper = styled.div`
  padding: 0 0.5rem;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
`;

export const EditLinkCardWrapper = styled.div`
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
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
    color: var(--mb-color-brand);
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
    color: var(--mb-color-brand);
  }
`;

const searchResultsStyles = `
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  min-width: 20rem;
  overflow-y: auto;

  background-color: var(--mb-color-background-primary);
  line-height: 24px;

  max-height: 400px;

  border: 1px solid var(--mb-color-border);
  border-radius: 6px;
  box-shadow: 0 7px 20px var(--mb-color-shadow);
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

  input {
    max-height: 38px; /* prevents natural height of input from growing beyond the (bordered) card container */
  }

  * {
    pointer-events: all;
  }
`;
