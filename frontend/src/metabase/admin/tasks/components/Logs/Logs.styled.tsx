import styled from "@emotion/styled";
import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";
import { color } from "metabase/ui/utils/colors";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

const LOG_PREFIX = ".react-ansi-style";

const LOG_COLORS = {
  black: (theme: Theme) => theme.fn.themeColor("text-dark"),
  white: (theme: Theme) => theme.fn.themeColor("text-white"),
  gray: (theme: Theme) => theme.fn.themeColor("text-medium"),
  red: (theme: Theme) => theme.fn.themeColor("saturated-red"),
  green: (theme: Theme) => theme.fn.themeColor("saturated-green"),
  yellow: (theme: Theme) => theme.fn.themeColor("saturated-yellow"),
  blue: (theme: Theme) => theme.fn.themeColor("saturated-blue"),
  magenta: (theme: Theme) => theme.fn.themeColor("saturated-purple"),
  cyan: () => "cyan",
};

export const LogsContainer = styled(LoadingAndErrorWrapper)`
  height: 100%;
  padding-left: 1rem;
`;

export const LogsContent = styled.div`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  font-family: "Lucida Console", Monaco, monospace;
  font-size: 14px;
  white-space: pre;
  padding: 1em;
  overflow: auto;
  height: 100%;

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

  ${({ theme }) =>
    Object.entries(LOG_COLORS).map(
      ([key, color]) => css`
        ${LOG_PREFIX}-${key} {
          color: ${color(theme)};
        }
      `,
    )};
`;
