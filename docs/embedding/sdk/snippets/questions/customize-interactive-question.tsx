import {
  InteractiveQuestion,
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;
const theme = {} as MetabaseTheme;

const ExampleDefaultInteractiveQuestion = () => (
  // [<snippet example-default-interactive-question>]
  <InteractiveQuestion questionId={95} />
  // [<endsnippet example-default-interactive-question>]
);

const ExampleCustomizedInteractiveQuestion = () => (
  // [<snippet example-customized-interactive-question>]
  <div
    className="App"
    style={{
      width: "100%",
      maxWidth: "1600px",
      height: "800px",
      margin: "0 auto",
    }}
  >
    <MetabaseProvider authConfig={authConfig} theme={theme}>
      <InteractiveQuestion questionId={95}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <div style={{ display: "grid", placeItems: "center", width: "100%" }}>
            <InteractiveQuestion.Title />
            <InteractiveQuestion.ResetButton />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              overflow: "hidden",
              width: "100%",
            }}
          >
            <div style={{ width: "100%" }}>
              <InteractiveQuestion.QuestionVisualization />
            </div>
            <div style={{ display: "flex", flex: 1, overflow: "scroll" }}>
              <InteractiveQuestion.Summarize />
            </div>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", width: "100%" }}
          >
            <InteractiveQuestion.Filter />
          </div>
        </div>
      </InteractiveQuestion>
    </MetabaseProvider>
  </div>
  // [<endsnippet example-customized-interactive-question>]
);
