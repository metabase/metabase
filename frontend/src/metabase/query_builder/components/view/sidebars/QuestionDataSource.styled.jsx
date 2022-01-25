import styled from "styled-components";
import { color } from "metabase/lib/colors";

import Badge from "metabase/components/Badge";

export const TablesDivider = styled.span`
  color: ${color("text-light")};
  font-size: 1em;
  font-weight: bold;
  padding: 0 0.2em;
  user-select: none;
`;

export const Container = styled.span`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
`;

export const SourceBadge = styled(Badge)`
  display: flex;
  width: 100%;

  .Icon {
    color: ${color("brand")};
    width: 1rem;
    height: 1rem;
    margin-right: 0.5em;
    padding: 1rem;
  }
  &:hover {
    .Icon {
      background-color: ${color("brand")};
      color: white;
    }
  }
`;
