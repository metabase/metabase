import {
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

const Example = () => (
  // [<snippet example-1>]
  <InteractiveDashboard
    dashboardId="Xk3YzAbCdEfGhIjKlMnOp"
    renderDrillThroughQuestion={QuestionView}
  />
  // [<endsnippet example-1>]
);

// [<snippet example-2>]
// You can use namespaced components to build the question's layout.
const QuestionView = () => <InteractiveQuestion.Title />;
// [<endsnippet example-2>]
