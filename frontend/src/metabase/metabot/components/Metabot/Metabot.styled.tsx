import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const MetabotRoot = styled.main`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: ${color("bg-white")};
`;

export const MetabotHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
`;
