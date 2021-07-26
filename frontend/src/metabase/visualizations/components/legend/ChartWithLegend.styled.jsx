import styled from "styled-components";

export const ChartWithLegendRoot = styled.div`
  display: flex;
  min-height: 0;
  padding: 0 1rem 1rem;
`;

export const ChartLegend = styled.div`
  width: 25%;
  min-width: 4rem;
  max-width: 20rem;
  overflow-y: auto;
`;

export const ChartContent = styled.div`
  flex: 1 1 auto;
  position: relative;
`;
