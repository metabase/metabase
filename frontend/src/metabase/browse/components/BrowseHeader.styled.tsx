import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const BrowseHeaderRoot = styled.div`
  margin-bottom: 1rem;
`;

export const BrowseHeaderContent = styled.div`
  display: flex;
  align-items: center;
  margin-top: 0.5rem;
`;

export const BrowseHeaderIconContainer = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;
