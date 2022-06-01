import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SampleRoot = styled.div`
  position: relative;
  height: 100%;
`;

export const SampleLayer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

export const SampleGrid = styled(SampleLayer)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: absolute;
`;

export const SampleTick = styled.div`
  border-top: 1px dashed ${color("border")};
`;

export const SampleAxis = styled.div`
  border-top: 1px solid ${color("border")};
`;

export const SamplePlot = styled(SampleLayer)`
  display: flex;
  gap: 10%;
  flex: 1 1 auto;
  padding: 0 1.5rem;
`;

export const SampleBar = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
`;

export const SampleBarItem = styled.div`
  flex: 1 1 auto;
`;
