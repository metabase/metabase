import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import Card from "metabase/components/Card";
import { GridItem } from "metabase/components/Grid";
import { Ellipsified } from "metabase/core/components/Ellipsified";

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const DatabaseGridItem = styled(GridItem)`
  width: 100%;

  &:hover {
    color: ${color("brand")};
  }

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;

export const ModelCard = styled(Card)`
  padding: 1.5rem;

  &:hover {
    color: ${color("brand")};
  }
  // TODO: Use rem 1rem is 16px, so 144px is 9rem
  height: 9rem;
  display: flex;
  flex-flow: column nowrap;
  justify-content: space-between;
  align-items: flex-start;
  // TODO: Ask Kyle about the box-shadow on the card, which is different between the spec and the defaults for this Card component

  // TODO: This feels hacky, is this the right way to do this?
  & .last-edit-info-label-button {
  }
  & .last-edit-info-label-button div,
  & .last-edit-info-label-button span {
    white-space: wrap !important;
    text-align: left;
    font-weight: normal;
  }
`;

export const LastEditedInfoSeparator = styled.span`
  padding: 0 6px;
`;

export const MultilineEllipsified = styled(Ellipsified)`
  white-space: pre-line;
  overflow: hidden;
  text-overflow: ellipsis;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

export const ModelGroupGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
  & > div {
    height: 144px;
    &:hover {
      color: ${color("brand")};
    }
  }
`;
