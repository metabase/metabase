import * as React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";

import type { EXTERNAL_DEPENDENCIES } from "../../../../build/embedding-sdk/constants/external-dependencies";

type ExternalDependenciesGlobalName =
  (typeof EXTERNAL_DEPENDENCIES)[keyof typeof EXTERNAL_DEPENDENCIES];

const CONFIG: Record<ExternalDependenciesGlobalName, any> = {
  METABASE_REACT: React,
  METABASE_REACT_JSX_RUNTIME: ReactJSXRuntime,
  METABASE_REACT_DOM: ReactDOM,
  METABASE_REACT_DOM_CLIENT: ReactDOMClient,
  METABASE_REACT_DOM_SERVER: ReactDOMServer,
};

// Put External Dependencies to the global object, so it can be used by the SDK bundle
export function defineGlobalDependencies() {
  if (typeof window === "undefined") {
    return;
  }

  Object.entries(CONFIG).forEach(([globalName, module]) => {
    // @ts-expect-error -- We are defining global variables
    window[globalName] = module;
  });
}
