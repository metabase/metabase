import styled from "@emotion/styled";

import EmptyState from "metabase/components/EmptyState";
import { color } from "metabase/lib/colors";
import { VisualizationRunningState } from "metabase/query_builder/components/QueryVisualization";
import { Icon } from "metabase/ui";

export const QueryBuilderRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  overflow: hidden;
`;

export const IdleStateRoot = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 0 auto;
  background-color: ${color("bg-light")};
`;

export const IdleStateIcon = styled(Icon)`
  color: ${color("bg-dark")};
  width: 2.5rem;
  height: 2.5rem;
`;

export const RunningStateRoot = styled(VisualizationRunningState)`
  flex: 1 0 auto;
`;

export const ErrorStateRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 0 auto;
`;

export const ErrorStateMessage = styled(EmptyState)`
  max-width: 25rem;
  padding: 1rem;
`;

export const QueryFooterRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 2rem;
`;
