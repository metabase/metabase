import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const BrowseHeaderContent = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 0.5rem 0.5rem 0;
`;

export const BrowseHeaderIconContainer = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;
