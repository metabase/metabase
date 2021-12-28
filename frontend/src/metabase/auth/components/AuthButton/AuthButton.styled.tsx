import styled from "styled-components";
import Link from "metabase/components/Link";
import { color } from "metabase/lib/colors";

export const TextRoot = styled.div`
  text-align: center;
`;

export const TextLink = styled(Link)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;
