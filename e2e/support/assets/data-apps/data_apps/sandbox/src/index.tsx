import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

import App from "./App";

const factory: DataAppFactory = () => ({ component: App });

export default factory;
