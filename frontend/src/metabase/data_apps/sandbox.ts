import createVirtualEnvironment from "@locker/near-membrane-dom";
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";

import { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import { CreateDashboardModal } from "embedding-sdk-bundle/components/public/CreateDashboardModal";
import { CreateQuestion } from "embedding-sdk-bundle/components/public/CreateQuestion";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { MetabotQuestion } from "embedding-sdk-bundle/components/public/MetabotQuestion";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  EditableDashboard,
  InteractiveDashboard,
  StaticDashboard,
} from "embedding-sdk-bundle/components/public/dashboard";
// eslint-disable-next-line no-restricted-imports
import { useAction } from "embedding-sdk-package/hooks/public/use-action";
// eslint-disable-next-line no-restricted-imports
import { useMetabaseQuery } from "embedding-sdk-package/hooks/public/use-metabase-query";
// eslint-disable-next-line no-restricted-imports
import { useQuestionQuery } from "embedding-sdk-package/hooks/public/use-question-query";
import {
  DataAppLink,
  DataAppRouter,
  useDataAppLocation,
} from "metabase/data_apps/router";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import { makeDistortionCallback } from "./sandbox/distortions";

/**
 * The bundle's factory returns:
 *   - `component` — the React tree the host will mount inside its
 *     `DataAppProvider`. Should be pure content; no `<MetabaseProvider>`
 *     inside — the host owns the provider wrap so the SDK store/theme/
 *     portal context live in host realm.
 *   - `theme` — the theme passed to `<DataAppProvider theme={…}>`. Same
 *     shape as the SDK's public `MetabaseTheme`.
 */
export type DataAppFactory = () => {
  component: React.ComponentType<Record<string, unknown>>;
  theme?: MetabaseTheme;
};

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createDataAppSandbox(
  label: string = "",
  targetWindow: Window = window,
) {
  let captured: unknown;

  const env = createVirtualEnvironment(
    targetWindow as Window & typeof globalThis,
    {
      distortionCallback: makeDistortionCallback(label),
      liveTargetCallback: isLiveTarget,
      endowments: Object.getOwnPropertyDescriptors({
        React,
        __react_jsx_runtime__: ReactJsxRuntime,
        __metabase_sdk__: {
          // Data fetching
          useQuestionQuery,
          useMetabaseQuery,
          // Custom actions
          useAction,
          // Question components
          InteractiveQuestion,
          StaticQuestion,
          SdkQuestion,
          CreateQuestion,
          MetabotQuestion,
          // Dashboard components
          EditableDashboard,
          InteractiveDashboard,
          StaticDashboard,
          CreateDashboardModal,
          // Collection
          CollectionBrowser,
        },
        __metabase_data_app__: {
          // Routing
          DataAppRouter,
          DataAppLink,
          useDataAppLocation,
        },
        get __dataAppFactory__() {
          return captured;
        },
        set __dataAppFactory__(value: unknown) {
          captured = value;
        },
      }),
    },
  );

  return {
    evaluate(code: string): DataAppFactory {
      try {
        env.evaluate(code);
      } catch (e) {
        let message: string;
        try {
          message = String((e as { message?: unknown })?.message ?? e);
        } catch {
          message = "Unknown error inside data-app sandbox";
        }
        throw new Error(message);
      }
      if (typeof captured !== "function") {
        throw new Error(
          "Bundle did not assign a function to __dataAppFactory__",
        );
      }
      return captured as DataAppFactory;
    },
  };
}
