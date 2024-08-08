import styled from "@emotion/styled";
import { Link } from "react-router";

import Card from "metabase/components/Card";
import { color } from "metabase/lib/colors";

import { BrowseGrid } from "./BrowseContainer.styled";

export const DatabaseGrid = styled(BrowseGrid)``;

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: none;

  &:hover {
    color: ${color("brand")};
  }
`;

export const DatabaseCardLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;
