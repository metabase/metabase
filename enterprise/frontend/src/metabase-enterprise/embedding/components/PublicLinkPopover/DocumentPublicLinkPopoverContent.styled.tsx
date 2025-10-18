import styled from "@emotion/styled";

import { Anchor } from "metabase/ui";

export const RemoveLinkAnchor = styled(Anchor)`
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;
