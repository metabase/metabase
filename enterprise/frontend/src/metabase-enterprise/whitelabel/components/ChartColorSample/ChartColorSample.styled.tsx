import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ChartRoot = styled.div`
  position: relative;
  height: 100%;
`;

export const ChartLayer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

export const ChartGrid = styled(ChartLayer)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: absolute;
`;

export const ChartTick = styled.div`
  border-top: 1px dashed ${color("border")};
`;

export const ChartAxis = styled.div`
  border-top: 1px solid ${color("border")};
`;

export const ChartPlot = styled(ChartLayer)`
  display: flex;
  justify-content: space-evenly;
  flex: 1 1 auto;
  align-items: flex-end;
`;

export const ChartBar = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  width: 10%;
`;

export const ChartBarSection = styled.div`
  flex: 1 1 auto;
`;
