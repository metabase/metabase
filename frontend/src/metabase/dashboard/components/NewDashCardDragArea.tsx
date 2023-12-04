import type { MouseEvent } from "react";
import { useState } from "react";
import { useEvent } from "react-use";
import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";

export function NewDashCardDragArea() {
  const [isDragging, setIsDragging] = useState(false);

  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEvent("mousedown", (event: MouseEvent) => {
    setIsDragging(true);
    setSize({ width: 0, height: 0 });
    setPosition({ top: event.clientY, left: event.clientX });
    document.documentElement.classList.add("user-select-none");
  });

  useEvent("mousemove", (event: MouseEvent) => {
    if (isDragging) {
      const width = event.clientX - position.left;
      const height = event.clientY - position.top;
      setSize({ width, height });
    }
  });

  useEvent("mouseup", () => {
    setIsDragging(false);
    document.documentElement.classList.remove("user-select-none");
  });

  return <Area style={{ ...position, ...size }} />;
}

const Area = styled.div`
  position: fixed;
  border: 1px solid ${color("brand-light")};
  background-color: ${alpha(color("brand"), 0.1)};
  will-change: top, right, bottom, left, width, height;
  z-index: 999;
`;
