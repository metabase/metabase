import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const BrowseHeaderContent = styled.div`
  display: flex;
  align-items: center;
  padding-top: 1rem;
  padding-bottom: 0.5rem;
  padding-inline-end: 0.5rem;
  padding-inline-start: 0;
`;

export const BrowseHeaderIconContainer = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  gap: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
