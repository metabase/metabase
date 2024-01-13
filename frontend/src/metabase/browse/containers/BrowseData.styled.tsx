import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import Card from "metabase/components/Card";
import { GridItem } from "metabase/components/Grid";

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
`;

export const ModelGridItem = styled(GridItem)`

  // TODO: Not sure we're using magic numbers like this
  height: 164px;
  // TODO: Tweak padding

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

export const LastEditedInfoSeparator = styled.span`
  padding: 0 6px;
`
