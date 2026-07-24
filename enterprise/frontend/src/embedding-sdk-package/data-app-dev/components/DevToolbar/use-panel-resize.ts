import { type MouseEvent as ReactMouseEvent, useState } from "react";

const MIN_PANEL_HEIGHT = 140;

const getDefaultPanelHeight = () =>
  typeof window !== "undefined" ? Math.round(window.innerHeight / 3) : 320;

export const usePanelResize = () => {
  const [height, setHeight] = useState(getDefaultPanelHeight);

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = height;

    const onMove = (moveEvent: MouseEvent) => {
      const next = startHeight + (startY - moveEvent.clientY);
      const max = window.innerHeight - 20;
      setHeight(Math.min(Math.max(next, MIN_PANEL_HEIGHT), max));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return { height, startResize };
};
