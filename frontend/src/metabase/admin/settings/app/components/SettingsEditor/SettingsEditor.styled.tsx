import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const NewVersionIndicator = styled.span`
  padding: 0.25rem 0.5rem;
  color: ${color("white")};
  font-size: 0.75em;
  font-weight: bold;
  background-color: ${color("brand")};
  border-radius: 0.5rem;
`;
