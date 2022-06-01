import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SketchRoot = styled.div`
  position: relative;
  height: 100%;
`;

export const SketchLayer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

export const SketchGrid = styled(SketchLayer)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: absolute;
`;

export const SketchGridLine = styled.div`
  border-top: 1px solid ${color("border")};
`;

export const SketchPlot = styled(SketchLayer)`
  display: flex;
  gap: 2rem;
  flex: 1 1 auto;
  padding: 0 1.5rem;
`;

export const SketchBar = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
`;

export const SketchBarItem = styled.div`
  flex: 1 1 auto;
`;
