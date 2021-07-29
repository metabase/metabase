import styled from "styled-components";
import { space } from "metabase/styled-components/theme";
import LegendCaption from "./LegendCaption";

export const ChartRoot = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  padding: ${space(2)};
`;

export const ChartCaption = styled(LegendCaption)`
  margin-bottom: ${space(2)};
`;
