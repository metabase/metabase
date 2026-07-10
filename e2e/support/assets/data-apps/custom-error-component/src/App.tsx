import { StaticQuestion } from "@metabase/embedding-sdk-react";

// A question id that does not exist, so the SDK renders its error path — which
// this app overrides with its own `errorComponent` (see index.tsx). Used to
// assert an app-supplied error component wins over the host default.
const MISSING_QUESTION_ID = 999999999;

export default function App() {
  return (
    <div data-testid="custom-error-app" style={{ padding: 24 }}>
      <h1>Custom error app</h1>
      <div style={{ height: 300 }}>
        <StaticQuestion questionId={MISSING_QUESTION_ID} />
      </div>
    </div>
  );
}
