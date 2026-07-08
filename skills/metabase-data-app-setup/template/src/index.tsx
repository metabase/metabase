import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

import App from "./App";
import { sdkTheme } from "./theme";

// The data app's entry point. Return the root component plus any `providerProps`
// the host should apply to `MetabaseProvider` (e.g. `theme`,
// `allowedCustomVisualizations`).
const factory: DataAppFactory = () => ({
  component: App,
  providerProps: { theme: sdkTheme },
});

export default factory;
