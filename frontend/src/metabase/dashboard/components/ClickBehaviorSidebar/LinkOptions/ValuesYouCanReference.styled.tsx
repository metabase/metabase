import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const PopoverTrigger = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  margin: 1rem 0;
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;
