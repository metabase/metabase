import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import { VisualizationRunningState } from "metabase/query_builder/components/QueryVisualization";

export const QueryStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-top: 1px solid ${color("border")};
`;

export const EmptyStateRoot = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 0 auto;
  border-top: 1px solid ${color("border")};
  background-color: ${color("bg-light")};
`;

export const EmptyStateIcon = styled(Icon)`
  color: ${color("bg-dark")};
  width: 2.5rem;
  height: 2.5rem;
`;

export const LoadingState = styled(VisualizationRunningState)`
  flex: 1 0 auto;
  border-top: 1px solid ${color("border")};
`;

export const ErrorStateRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border-top: 1px solid ${color("border")};
`;

export const ErrorStateMessage = styled(EmptyState)`
  max-width: 25rem;
  padding: 1rem;
`;
