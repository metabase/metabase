import styled from "@emotion/styled";

import EntityMenu from "metabase/components/EntityMenu";
import { color, lighten } from "metabase/lib/colors";

export const CardMenuRoot = styled(EntityMenu)`
  display: flex;
  align-items: center;
  margin: 0 0 0 0.5rem;
  cursor: pointer;
  color: ${lighten("text-light", 0.1)};

  &:hover {
    color: ${color("brand")};
  }
`;
