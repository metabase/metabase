// eslint-disable-next-line no-restricted-imports
import { Global, css } from "@emotion/react";
import { configureStore } from "@reduxjs/toolkit";
import { useMemo } from "react";

import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { MetabaseReduxProvider } from "metabase/lib/redux/custom-context";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { Box, ThemeProvider, useMantineTheme } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { NotebookProvider } from "../Notebook/context";
import { NotebookStepList } from "../NotebookStepList";

interface ReadOnlyNotebookProps {
  question: Question;
}

const noop = async () => {};

const readOnlyStore = configureStore({
  reducer: {
    currentUser: () => null,
    settings: () => ({ values: { "site-locale": "en" }, loading: false }),
  },
  middleware: () => [],
});

const fontStyles = css`
  :root {
    --mb-default-font-family: "Lato", sans-serif;
  }
  ${defaultFontFiles()}
`;

function ReadOnlyNotebookInner({ question }: ReadOnlyNotebookProps) {
  const theme = useMantineTheme();

  const cssVariables = useMemo(
    () => getMetabaseCssVariables({ theme, whitelabelColors: null }),
    [theme],
  );

  return (
    <>
      <Global styles={cssVariables} />
      <Global styles={fontStyles} />
      <NotebookProvider>
        <Box pos="relative">
          <NotebookStepList
            question={question}
            reportTimezone=""
            updateQuestion={noop}
            readOnly
          />
        </Box>
      </NotebookProvider>
    </>
  );
}

export function ReadOnlyNotebook({ question }: ReadOnlyNotebookProps) {
  return (
    <MetabaseReduxProvider store={readOnlyStore}>
      <ThemeProvider>
        <ReadOnlyNotebookInner question={question} />
      </ThemeProvider>
    </MetabaseReduxProvider>
  );
}
