import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

import App from "./App";

const factory: DataAppFactory = () => ({
  component: App,
  providerProps: {
    allowedCustomVisualizations: ["custom:demo-viz"],
  },
});

export default factory;
