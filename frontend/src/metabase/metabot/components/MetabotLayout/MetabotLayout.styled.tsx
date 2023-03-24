import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";

export const MetabotRoot = styled.main`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const MetabotHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${color("border")};
  background-color: ${color("bg-white")};
`;

export const MetabotResultsSkeleton = styled(ChartSkeleton)`
  padding: 4rem 1rem 1rem 1rem;
`;
