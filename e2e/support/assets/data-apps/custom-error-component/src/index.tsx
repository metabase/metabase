import type { SdkErrorComponentProps } from "@metabase/embedding-sdk-react";
import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

import App from "./App";

// A distinctive error component the app ships via `providerProps`; the host
// renders it instead of the default neutral data-app error state.
function CustomError({ message }: SdkErrorComponentProps) {
  return (
    <div data-testid="custom-error-component">Custom app error: {message}</div>
  );
}

const factory: DataAppFactory = () => ({
  component: App,
  providerProps: { errorComponent: CustomError },
});

export default factory;
