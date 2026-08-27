// Component supports Mantine-like Styles API
// Technically this is not the 1:1 mapping of the Mantine API, but it's close enough
// https://mantine.dev/styles/styles-api/
import type React from "react";

export type DataGridStylesNames =
  | "root"
  | "tableGrid"
  | "row"
  | "headerContainer"
  | "headerCell"
  | "bodyContainer"
  | "bodyCell"
  | "footer";

export type DataGridStylesProps = {
  classNames?: { [key in DataGridStylesNames]?: string };
  styles?: { [key in DataGridStylesNames]?: React.CSSProperties };
};
