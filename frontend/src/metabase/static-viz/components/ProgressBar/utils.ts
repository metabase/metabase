import Color from "color";
import { ProgressBarData } from "./types";

export const createPalette = (color: string) => ({
  unachieved: color,
  achieved: Color(color)
    .darken(0.25)
    .hex(),
  exceeded: Color(color)
    .darken(0.5)
    .hex(),
});

export const getColors = (
  { value, goal }: ProgressBarData,
  palette: ReturnType<typeof createPalette>,
) => {
  const isExceeded = value > goal;

  const backgroundBar = isExceeded ? palette.exceeded : palette.unachieved;
  const foregroundBar = palette.achieved;
  const pointer = isExceeded ? palette.exceeded : palette.achieved;

  return {
    backgroundBar,
    foregroundBar,
    pointer,
  };
};

export const getBarText = ({ value, goal }: ProgressBarData) => {
  if (value === goal) {
    return "Goal met";
  } else if (value > goal) {
    return "Goal exceeded";
  }

  return null;
};
