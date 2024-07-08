import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const DragOverlay = styled.div<{ isDragActive: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  background-color: ${color("brand-lighter")};
  opacity: ${props => (props.isDragActive ? 0.9 : 0)};
  transition: opacity 0.2s;
  border: 1px dashed ${color("brand")};
  border-radius: 0.5rem;
  margin: 0.5rem 4%;
  padding: 4rem;
  color: ${color("brand")};
  font-size: 1.125rem;
  font-weight: bold;
  pointer-events: none;
`;
