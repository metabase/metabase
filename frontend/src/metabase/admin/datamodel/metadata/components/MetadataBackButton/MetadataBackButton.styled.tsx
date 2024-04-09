import styled from "@emotion/styled";
import { Link } from "react-router";

import { color } from "metabase/lib/colors";

export const BackButtonLink = styled(Link)`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  border-radius: 99px;
  color: ${color("white")};
  background-color: ${color("bg-dark")};

  &:hover {
    background-color: ${color("brand")};
  }
`;
