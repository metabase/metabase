import createVirtualEnvironment from "@locker/near-membrane-dom";
import * as React from "react";

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
import { useMetabaseQuery } from "embedding-sdk-package/hooks/public/use-metabase-query";
import { useQuestionQuery } from "embedding-sdk-package/hooks/public/use-question-query";
import { DataAppProvider } from "metabase/data_apps/components/DataAppProvider";

import { makeDistortionCallback } from "./sandbox/distortions";

/**
 * Sandbox for data-app plugin bundles.
 *
 * Endowments:
 *   - React: the host's React instance so plugins don't bundle their own.
 *   - MetabaseProvider: wraps a subtree with the SDK Redux store and an
 *     `SdkThemeProvider`. The plugin uses this exactly as it would the
 *     public SDK's `MetabaseProvider`: wrap your tree once, pass `theme`,
 *     and use the other SDK components inside.
 *   - All public SDK components (questions, dashboards, collection browser,
 *     create-question / create-dashboard modals, Metabot question, debug
 *     info). Each one assumes it's rendered inside a `MetabaseProvider` —
 *     no internal wrapping — matching the published SDK API.
 *
 * Plugin contract: write a factory function to globalThis.__customVizPlugin__.
 * The host calls factory(hostApi) and renders the returned `component` inside
 * its own React tree.
 */

// Future: { runQuery, fetchCard, … }. Empty for the PoC.
export type DataAppHostApi = Record<string, never>;

export type DataAppFactory = (hostApi: DataAppHostApi) => {
  component: React.ComponentType<Record<string, unknown>>;
};

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createDataAppSandbox(
  label: string = "",
  targetWindow: Window = window,
) {
  let captured: unknown;

  // near-membrane-dom narrows the first arg to `Window & typeof globalThis`
  // (i.e., the global window). Foreign-realm windows from same-origin
  // iframes match the shape at runtime — Near Membrane only reads
  // standard DOM properties — but TS can't prove the assignability.
  const env = createVirtualEnvironment(
    targetWindow as Window & typeof globalThis,
    {
      distortionCallback: makeDistortionCallback(label),
      liveTargetCallback: isLiveTarget,
      endowments: Object.getOwnPropertyDescriptors({
        React,
        // Data fetching
        useQuestionQuery,
        useMetabaseQuery,
        // Provider
        MetabaseProvider: DataAppProvider,
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
        get __customVizPlugin__() {
          return captured;
        },
        set __customVizPlugin__(value: unknown) {
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
          "Bundle did not assign a function to __customVizPlugin__",
        );
      }
      return captured as DataAppFactory;
    },
  };
}
