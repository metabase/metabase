import {
  InteractiveQuestion,
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;
const theme = {} as MetabaseTheme;

const questionId = 1;

const Example = () => (
  // [<snippet example>]
  <MetabaseProvider authConfig={authConfig} theme={theme}>
    <InteractiveQuestion questionId={questionId} />
  </MetabaseProvider>
  // [<endsnippet example>]
);
