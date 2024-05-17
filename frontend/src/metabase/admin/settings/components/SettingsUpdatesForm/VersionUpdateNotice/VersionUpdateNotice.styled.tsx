import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const NewVersionContainer = styled.div`
  background-color: ${color("summarize")};
`;

export const OnLatestVersionMessage = styled.div`
  padding: 1rem;
  color: ${color("white")};
  font-weight: bold;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  background-color: ${color("brand")};
`;
