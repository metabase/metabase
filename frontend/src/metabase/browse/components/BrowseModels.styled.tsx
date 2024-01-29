import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import Card from "metabase/components/Card";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Link from "metabase/core/components/Link";
import { Group } from "metabase/ui";

export const ModelCard = styled(Card)`
  padding: 1.5rem;
  padding-bottom: 1rem;

  &:hover h4 {
    color: ${color("brand")};
  }

  height: 9rem;
  display: flex;
  flex-flow: column nowrap;
  justify-content: flex-start;
  align-items: flex-start;

  border: 1px solid ${color("border")};
  box-shadow: 0px 1px 4px 0px rgba(0, 0, 0, 0.06) !important;
`;

export const MultilineEllipsified = styled(Ellipsified)`
  white-space: pre-line;
  overflow: hidden;
  text-overflow: ellipsis;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

export const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 1rem;
  width: 100%;

  ${breakpointMinSmall} {
    padding-bottom: 1rem;
  }
  ${breakpointMinMedium} {
    padding-bottom: 3rem;
  }
`;

export const CollectionHeaderContainer = styled.div`
  grid-column: 1 / -1;
  align-items: center;
  padding-top: 0.5rem;
  margin-right: 1rem;
  &:not(:first-of-type) {
    border-top: 1px solid #f0f0f0;
  }
`;

export const CollectionHeaderLink = styled(Link)`
  &:hover * {
    color: ${color("brand")};
  }
`;

export const CollectionHeaderGroup = styled(Group)`
  position: relative;
  top: 0.5rem;
`;
