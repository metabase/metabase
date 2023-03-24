import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const MetabotQueryBuilderRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

export const MetabotQueryVisualizationContainer = styled.div`
  flex: 1 0 auto;
  border-top: 1px solid ${color("border")};
  border-bottom: 1px solid ${color("border")};
`;
