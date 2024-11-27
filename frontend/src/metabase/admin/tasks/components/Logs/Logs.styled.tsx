import { css } from "@emotion/react";
import styled from "@emotion/styled";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";

const LOG_PREFIX = ".react-ansi-style";

const LOG_COLORS = {
  black: color("text-dark"),
  white: color("text-white"),
  gray: color("text-medium"),
  cyan: "cyan",
};

export const LogsContainer = styled(LoadingAndErrorWrapper)`
  height: 100%;
  padding-left: 1rem;
  display: flex;
  flex-direction: column;
`;

export const LogsContent = styled.div`
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-light);
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
    color: var(--mb-color-text-dark);
    background-color: var(--mb-color-bg-white);
  }

  ${LOG_PREFIX}-hidden {
    color: transparent;
  }

  ${LOG_PREFIX}-strikethrough {
    text-decoration: line-through;
  }

  ${LOG_PREFIX}-red {
    color: var(--mb-base-color-lobster-50);
  }

  ${LOG_PREFIX}-green {
    color: var(--mb-base-color-palm-40);
  }

  ${LOG_PREFIX}-yellow {
    color: var(--mb-base-color-dubloon-30);
  }

  ${LOG_PREFIX}-blue {
    color: var(--mb-base-color-ocean-50);
  }

  ${LOG_PREFIX}-magenta {
    color: var(--mb-base-color-octopus-60);
  }

  ${Object.entries(LOG_COLORS).map(
    ([key, color]) => css`
      ${LOG_PREFIX}-${key} {
        color: ${color};
      }
    `,
  )};
`;
