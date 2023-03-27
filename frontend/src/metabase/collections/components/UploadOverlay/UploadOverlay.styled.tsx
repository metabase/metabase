import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";

export const DragOverlay = styled.div<{ isDragActive: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background-color: ${alpha("white", 0.8)};
  padding: 2rem;
  font-size: 2rem;
  color: ${color("text-dark")};
  opacity: ${props => (props.isDragActive ? 1 : 0)};
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
`;
