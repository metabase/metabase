import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { VisualizationRunningState } from "metabase/query_builder/components/QueryVisualization";

export const QueryBuilderRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  overflow: hidden;
  border-top: 1px solid ${color("border")};
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
