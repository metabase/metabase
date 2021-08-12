import styled from "styled-components";
import LegendCaption from "./legend/LegendCaption";

export const LineAreaBarChartRoot = styled.div`
  display: flex;
  flex-direction: column;
`;

export const ChartLegendCaption = styled(LegendCaption)`
  flex: 0 0 auto;
  padding: 0.5rem 0.5rem 0;
`;
