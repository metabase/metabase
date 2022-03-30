import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const LayoutRoot = styled.div`
  flex: 1;
  background-color: ${color("bg-light")};
`;

export const LayoutBody = styled.div`
  padding: 4rem 7rem;
`;

export const LayoutScene = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

export const LayoutSceneImage = styled.img`
  position: relative;
  left: -64px;
  bottom: -3px;
  mix-blend-mode: multiply;
`;
