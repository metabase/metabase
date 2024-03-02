import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const OptionItemTitle = styled.div`
  color: ${color("brand")};
`;

export const OptionItemDescription = styled.div`
  color: ${color("text-medium")};
`;

export const OptionItemRoot = styled.li`
  padding: 0.5rem 1.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    ${OptionItemTitle}, ${OptionItemDescription} {
      color: ${color("white")};
    }
  }
`;
