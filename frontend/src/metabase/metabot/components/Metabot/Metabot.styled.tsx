import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const MetabotRoot = styled.main`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: ${color("bg-white")};
`;
