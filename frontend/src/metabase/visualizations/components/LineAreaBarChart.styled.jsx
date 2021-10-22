import styled from "styled-components";

import LegendCaption from "./legend/LegendCaption";

export const LineAreaBarChartRoot = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${({ isQueryBuilder }) =>
    isQueryBuilder ? "1rem 1rem 1rem 2rem" : "0.5rem 1rem"};
  overflow: hidden;
`;

export const ChartLegendCaption = styled(LegendCaption)`
  flex: 0 0 auto;
  margin-bottom: 0.5rem;
`;
