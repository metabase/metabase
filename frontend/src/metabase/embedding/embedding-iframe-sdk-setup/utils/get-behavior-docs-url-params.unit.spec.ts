import type { SdkIframeEmbedSetupSettings } from "../types";

import {
  type BehaviorDocsParams,
  getBehaviorDocsUrlParams,
} from "./get-behavior-docs-url-params";

describe("getBehaviorDocsUrlParams", () => {
  it.each<{
    name: string;
    settings: Partial<SdkIframeEmbedSetupSettings>;
    expected: BehaviorDocsParams;
  }>([
    {
      name: "guest settings",
      settings: { isGuest: true, componentName: "metabase-question" },
      expected: { page: "embedding/guest-embedding" },
    },
    {
      name: "exploration template",
      settings: {
        isGuest: false,
        componentName: "metabase-question",
        template: "exploration",
      },
      expected: { page: "embedding/question-reference" },
    },
    {
      name: "metabase-question component",
      settings: { componentName: "metabase-question", questionId: 1 },
      expected: { page: "embedding/question-reference" },
    },
    {
      name: "metabase-dashboard component",
      settings: { componentName: "metabase-dashboard", dashboardId: 1 },
      expected: { page: "embedding/dashboard-reference" },
    },
    {
      name: "metabase-browser component",
      settings: { componentName: "metabase-browser" },
      expected: { page: "embedding/browser-reference" },
    },
    {
      name: "metabase-metabot component",
      settings: { componentName: "metabase-metabot" },
      expected: null,
    },
  ])("returns $expected for $name", ({ settings, expected }) => {
    expect(
      // Unjustified type cast. FIXME
      getBehaviorDocsUrlParams(settings as SdkIframeEmbedSetupSettings),
    ).toEqual(expected);
  });
});
