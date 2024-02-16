import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";
import { BrowseGrid } from "./BrowseApp.styled";

export const DatabaseGrid = styled(BrowseGrid)`
  margin-top: 1rem;
`;

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;
  box-shadow: none;
  &:hover {
    color: ${color("brand")};
  }
`;

export const DatabaseGridItem = styled.div`
  &:hover {
    color: ${color("brand")};
  }
`;
