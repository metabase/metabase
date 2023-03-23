import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const MetabotRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const MetabotHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${color("border")};
  background-color: ${color("bg-white")};
`;
