import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const StyledAnchor = styled.a`
  padding: 4px;

  &:hover {
    color: ${color("text-dark")};
  }
`;
