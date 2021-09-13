import styled from "styled-components";
import { color } from "metabase/lib/colors";
import RawEntityLink from "metabase/entities/containers/EntityLink";

export const EntityLink = styled(RawEntityLink)`
  color: ${color("brand")};
  cursor: pointer;
  text-decoration: none;

  :hover {
    text-decoration: underline;
  }
`;
