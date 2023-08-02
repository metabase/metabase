import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const OptionItemRoot = styled.li`
  padding: 0.5rem 1.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
