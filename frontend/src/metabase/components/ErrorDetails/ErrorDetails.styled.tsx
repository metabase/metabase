import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const MonospaceErrorDisplay = styled.div`
  font-family: monospace;
  white-space: pre-wrap;
  padding: 1rem;
  margin-top: 0.5rem;
  font-weight: bold;
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  border: 1px solid ${color("border")};
  max-height: 16rem;
  overflow-y: auto;
`;
