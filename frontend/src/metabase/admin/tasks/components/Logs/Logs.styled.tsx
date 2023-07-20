import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

const ANSI_COLORS = {
  black: color("text-dark"),
  white: color("text-white"),
  gray: color("text-medium"),
  red: color("saturated-red"),
  green: color("saturated-green"),
  yellow: color("saturated-yellow"),
  blue: color("saturated-blue"),
  magenta: color("saturated-purple"),
  cyan: "cyan",
};

const getColorRule = (name: string, color: string) => {
  return `.react-ansi-style-${name} { color: ${color} !important }`;
};

export const LogsContainer = styled.div`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  font-family: "Lucida Console", Monaco, monospace;
  font-size: 14px;
  white-space: pre;
  padding: 1em;
  overflow-x: scroll;

  ${Object.entries(ANSI_COLORS)
    .map(([name, color]) => getColorRule(name, color))
    .join(" ")}
`;
