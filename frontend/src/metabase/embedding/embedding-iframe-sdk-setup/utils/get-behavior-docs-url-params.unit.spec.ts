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
      expected: { page: "embedding/components", anchor: "question" },
    },
    {
      name: "metabase-question component",
      settings: { componentName: "metabase-question", questionId: 1 },
      expected: { page: "embedding/components", anchor: "question" },
    },
    {
      name: "metabase-dashboard component",
      settings: { componentName: "metabase-dashboard", dashboardId: 1 },
      expected: { page: "embedding/components", anchor: "dashboard" },
    },
    {
      name: "metabase-browser component",
      settings: { componentName: "metabase-browser" },
      expected: { page: "embedding/components", anchor: "browser" },
    },
    {
      name: "metabase-metabot component",
      settings: { componentName: "metabase-metabot" },
      expected: null,
    },
  ])("returns $expected for $name", ({ settings, expected }) => {
    expect(
      getBehaviorDocsUrlParams(settings as SdkIframeEmbedSetupSettings),
    ).toEqual(expected);
  });
});
