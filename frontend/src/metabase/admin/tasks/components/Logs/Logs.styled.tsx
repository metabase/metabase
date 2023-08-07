import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

const LOG_PREFIX = ".react-ansi-style";

const LOG_COLORS = {
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

export const LogsContainer = styled.div`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  font-family: "Lucida Console", Monaco, monospace;
  font-size: 14px;
  white-space: pre;
  padding: 1em;
  overflow-x: scroll;

  ${LOG_PREFIX}-bold {
    font-weight: bold;
  }

  ${LOG_PREFIX}-dim {
    font-weight: lighter;
  }

  ${LOG_PREFIX}-italic {
    font-style: italic;
  }

  ${LOG_PREFIX}-underline {
    text-decoration: underline;
  }

  ${LOG_PREFIX}-inverse {
    color: ${color("black")};
    background-color: ${color("white")};
  }

  ${LOG_PREFIX}-hidden {
    color: transparent;
  }

  ${LOG_PREFIX}-strikethrough {
    text-decoration: line-through;
  }

  ${Object.entries(LOG_COLORS).map(
    ([key, color]) => css`
      ${LOG_PREFIX}-${key} {
        color: ${color};
      }
    `,
  )};
`;
