import { useCallback, useEffect, useRef } from "react";
import type { RGBColor } from "react-color";

import { AlphaGradient, AlphaPointer, AlphaTrack } from "./ColorPicker.styled";

interface AlphaSliderProps {
  rgb: RGBColor;
  alpha: number;
  onAlphaChange: (alpha: number) => void;
}

export function AlphaSlider({ rgb, alpha, onAlphaChange }: AlphaSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const onAlphaChangeRef = useRef(onAlphaChange);
  onAlphaChangeRef.current = onAlphaChange;

  const setAlphaFromX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return;
    }
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, ratio));
    onAlphaChangeRef.current(Math.round(clamped * 100) / 100);
  }, []);

  const draggingRef = useRef(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (draggingRef.current) {
        setAlphaFromX(e.clientX);
      }
    };
    const handleUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [setAlphaFromX]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    setAlphaFromX(e.clientX);
  };

  const colorVar = {
    ["--alpha-color" as string]: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
  };

  return (
    <AlphaTrack
      ref={trackRef}
      onMouseDown={handleMouseDown}
      role="slider"
      aria-label="Alpha"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={alpha}
    >
      <AlphaGradient style={colorVar} />
      <AlphaPointer style={{ left: `${alpha * 100}%` }} />
    </AlphaTrack>
  );
}
