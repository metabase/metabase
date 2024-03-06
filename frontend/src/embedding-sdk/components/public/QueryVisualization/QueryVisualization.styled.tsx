import styled from "@emotion/styled";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { color } from "metabase/ui/utils/colors";

export const QueryVisualizationSdkWrapper = styled(QueryVisualization)`
  background: ${color("white")};
  color: ${color("text-dark")};
  flex: 1;
`;
