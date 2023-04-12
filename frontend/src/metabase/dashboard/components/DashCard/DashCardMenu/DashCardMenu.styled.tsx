import styled from "@emotion/styled";
import { color, lighten } from "metabase/lib/colors";
import EntityMenu from "metabase/components/EntityMenu";

export const CardMenuRoot = styled(EntityMenu)`
  display: block;
  margin: 0 0 0 0.5rem;
  cursor: pointer;
  color: ${lighten("text-light", 0.1)};

  &:hover {
    color: ${color("brand")};
  }
`;
