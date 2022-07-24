import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const StyledAnchor = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;

  padding: 4px;

  &:hover {
    color: ${color("text-dark")};
  }
`;
