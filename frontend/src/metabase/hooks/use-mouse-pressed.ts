import { useCallback, useEffect, useState } from "react";

export const useMousePressed = () => {
  const [isMousePressed, setIsMousePressed] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsMousePressed(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsMousePressed(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseUp]);

  return isMousePressed;
};
