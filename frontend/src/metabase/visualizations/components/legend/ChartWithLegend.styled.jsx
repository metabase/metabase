import styled from "styled-components";
import { space } from "metabase/styled-components/theme";
import LegendTitle from "./LegendTitle";

export const ChartRoot = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  padding: ${space(2)};
  min-height: 0;
`;

export const ChartTitle = styled(LegendTitle)`
  padding-bottom: ${space(2)};
`;
