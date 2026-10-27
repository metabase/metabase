import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

import App from "./App";

const factory: DataAppFactory = () => ({
  component: App,
  providerProps: {
    // The SDK loads no custom viz outside this allowlist; custom-viz.cy.spec.ts uses demo-viz.
    allowedCustomVisualizations: ["custom:demo-viz"],
  },
});

export default factory;
