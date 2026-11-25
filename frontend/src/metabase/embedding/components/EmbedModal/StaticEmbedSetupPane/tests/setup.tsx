import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupParameterValuesEndpoints,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { expectNoBadSchemaEvents } from "__support__/snowplow";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/embedding/types";
import type {
  EmbedResourceDownloadOptions,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import type { StaticEmbedSetupPaneProps } from "../StaticEmbedSetupPane";
import { StaticEmbedSetupPane } from "../StaticEmbedSetupPane";

function TextEditorMock({
  highlightRanges,
  value,
}: {
  highlightRanges?: { start: number; end: number }[];
  value: string;
}) {
  const highlightedTexts = highlightRanges?.map((range) =>
    value.slice(range.start, range.end),
  );
  return (
    <>
      <div data-testid="text-editor-mock">{value}</div>
      <div data-testid="text-editor-mock-highlighted-code">
        {highlightedTexts}
      </div>
    </>
  );
}

jest.mock("metabase/common/components/CodeEditor", () => ({
  CodeEditor: TextEditorMock,
}));

export const FONTS_MOCK_VALUES = [
  "My Awesome Font",
  "Some Font 2",
  "And Another Third Font",
];

export interface SetupOpts {
  props: Partial<StaticEmbedSetupPaneProps>;
  activeTab?: "Overview" | "Parameters" | "Appearance";
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export async function setup({
  props: {
    resourceType = "dashboard",
    resource = getMockResource(resourceType),
    resourceParameters = [],
    onUpdateEmbeddingParams = jest.fn(),
    onUpdateEnableEmbedding = jest.fn(),
  } = {},
  activeTab = "Overview",
  enterprisePlugins,
  tokenFeatures = createMockTokenFeatures(),
}: {
  props: Partial<StaticEmbedSetupPaneProps>;
  activeTab?: "Overview" | "Parameters" | "Look and Feel";
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: TokenFeatures;
}) {
  setupParameterValuesEndpoints({
    values: [],
    has_more_values: false,
  });
  setupTokenStatusEndpoint({ valid: !!enterprisePlugins });

  const settings = mockSettings({
    "enable-embedding": true,
    "embedding-secret-key": "my_super_secret_key",
    "token-features": tokenFeatures,
    "available-fonts": enterprisePlugins ? FONTS_MOCK_VALUES : undefined,
  });
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: settings,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  const view = renderWithProviders(
    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
    />,
    {
      storeInitialState: state,
    },
  );

  if (activeTab && activeTab !== "Overview") {
    await userEvent.click(
      await screen.findByRole("tab", {
        name: activeTab,
      }),
    );
  }

  return {
    ...view,
    onUpdateEmbeddingParams,
    onUpdateEnableEmbedding,
  };
}

export function getMockResource(
  resourceType: EmbedResourceType,
  isPublished: boolean = false,
): EmbedResource {
  if (resourceType === "dashboard") {
    return createMockDashboard({
      enable_embedding: isPublished,
    });
  }

  return createMockCard({
    enable_embedding: isPublished,
  });
}

export async function selectServerCodeLanguage({
  currentLanguage = "Node.js",
  newLanguage,
}: {
  currentLanguage?: string;
  newLanguage: string;
}) {
  await userEvent.click(screen.getByDisplayValue(currentLanguage));

  await userEvent.click(
    within(await screen.findByRole("listbox")).getByText(newLanguage),
  );
}

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
const { trackSchemaEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

export function clearTrackedEvents() {
  jest.mocked(trackSchemaEvent).mockClear();
}

export async function copyCode(code: "backend" | "frontend") {
  await userEvent.click(
    within(screen.getByTestId(`embed-${code}`)).getByTestId("copy-button"),
  );
}

type CodeCopiedEvent = {
  artifact: EmbedResourceType;
  language: string;
  location: "code_overview" | "code_params" | "code_appearance";
  code: "backend" | "view";
  appearance?: {
    background?: boolean;
    bordered?: boolean;
    titled?: boolean;
    font?: "instance" | "custom";
    theme?: "light" | "night";
    enabled_download_types?: EmbedResourceDownloadOptions | null;
  };
};

/** Checks the last `static_embed_code_copied` event against the defaults of a fresh modal. */
export function expectCodeCopiedEvent({
  appearance,
  ...event
}: CodeCopiedEvent) {
  expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
    event: "static_embed_code_copied",
    ...event,
    appearance: {
      background: true,
      bordered: true,
      titled: true,
      font: "instance",
      theme: "light",
      enabled_download_types: null,
      downloads: null,
      ...appearance,
    },
  });
}

/** Checks the number of `embed_flow` events, and that each of them is valid. */
export function expectTrackedEventCount(count: number) {
  const { calls } = jest.mocked(trackSchemaEvent).mock;
  expect(calls.filter(([schema]) => schema === "embed_flow")).toHaveLength(
    count,
  );
  expectNoBadSchemaEvents(calls, "embed_flow", "1-0-3");
}
