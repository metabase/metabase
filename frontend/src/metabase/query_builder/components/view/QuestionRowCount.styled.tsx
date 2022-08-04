import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const LimitPopoverTrigger = styled.span`
  font-weight: bold;

  &:hover {
    color: ${color("brand")};
  }
`;
