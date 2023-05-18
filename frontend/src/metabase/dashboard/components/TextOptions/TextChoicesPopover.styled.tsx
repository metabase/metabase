import styled from "@emotion/styled";

import { color, alpha } from "metabase/lib/colors";

export const PopoverBody = styled.div`
  max-width: 300px;
  padding: 0.7rem 0.6rem;
`;

export const StyledList = styled.ul`
  li:not(:last-child) {
    margin-bottom: 0.4rem;
  }
`;

export const StyledListItem = styled.li`
  padding: 0.7rem 1.5rem 0.7rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;

  :hover {
    color: ${color("brand")};
    background-color: ${alpha("brand", 0.09)};

    * {
      color: ${color("brand")};
    }
  }
`;

export const StyledDiv = styled.div`
  font-weight: 700;
`;
