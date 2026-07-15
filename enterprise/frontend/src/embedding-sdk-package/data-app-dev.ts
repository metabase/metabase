// Browser subpath `@metabase/embedding-sdk-react/data-app-dev` with dev app client exports.
// The Node Vite config preset lives at `/data-app-dev/config` (data-app-dev.config.ts).
export { DataAppDevProvider } from "./data-app-dev/components/DataAppDevProvider/DataAppDevProvider";
export { DevToolbar } from "./data-app-dev/components/DevToolbar/DevToolbar";
export { installDevDiagnostics } from "./data-app-dev/components/DevToolbar/diagnostics";
export { createDataAppSandbox } from "metabase-enterprise/data_apps/sandbox/sandbox";
