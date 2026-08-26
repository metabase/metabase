import {
  type SdkErrorComponentProps,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";
import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

// A question id that does not exist, so the SDK takes its error path — which this
// app overrides with its own `errorComponent`, asserting an app-supplied component
// wins over the host's default neutral error state.
const MISSING_QUESTION_ID = 999999999;

function CustomError({ message }: SdkErrorComponentProps) {
  return (
    <div data-testid="custom-error-component">Custom app error: {message}</div>
  );
}

function App() {
  return (
    <div data-testid="custom-error-app" style={{ padding: 24 }}>
      <h1>Custom error app</h1>
      <div style={{ height: 300 }}>
        <StaticQuestion questionId={MISSING_QUESTION_ID} />
      </div>
    </div>
  );
}

const factory: DataAppFactory = () => ({
  component: App,
  providerProps: { errorComponent: CustomError },
});

export default factory;
