// The data-app Near-Membrane sandbox runtime, published so the data-app dev
// template runs bundles through the exact same membrane + distortion rules the
// Metabase host uses in production. Unlike `./data-app` (the in-sandbox API that
// is endowed INTO the bundle), this is the host-side machinery that BUILDS the
// sandbox, so it must never be endowed. The caller injects its realm's React/SDK
// as endowments (see `createDataAppSandbox`), keeping this entry free of an SDK
// copy of its own.

export { createDataAppSandbox } from "metabase-enterprise/data_apps/sandbox";
export type {
  CreateDataAppSandboxOptions,
  DataAppFactory,
  DataAppSandboxEndowments,
} from "metabase-enterprise/data_apps/sandbox";
