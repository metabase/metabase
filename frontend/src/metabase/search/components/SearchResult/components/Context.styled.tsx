import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ContextText = styled("p")`
  line-height: 1.4em;
  color: ${color("text-medium")};
  margin-top: 0;
`;

export const ContextContainer = styled.div`
  margin-left: 42px;
  margin-top: 12px;
  max-width: 620px;
`;
