import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

import App from "./App";
import { getTestEnv } from "./test-env";

const factory: DataAppFactory = () => ({
  component: App,
  providerProps: {
    allowedCustomVisualizations: getTestEnv().allowedCustomVisualizations,
  },
});

export default factory;
