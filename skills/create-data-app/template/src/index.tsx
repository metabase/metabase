import type { MetabaseTheme } from "@metabase/embedding-sdk-react";
import type { ComponentType } from "react";

import App from "./App";
import { sdkTheme } from "./theme";

type Factory = () => {
  component: ComponentType;
  theme?: MetabaseTheme;
};

const factory: Factory = () => ({ component: App, theme: sdkTheme });

export default factory;
