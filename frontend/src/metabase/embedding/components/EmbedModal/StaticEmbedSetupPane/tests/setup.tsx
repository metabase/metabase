import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupParameterValuesEndpoints,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/embedding/types";
import { createMockState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
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

  // StaticEmbedSetupPane computes the signed preview URL in a useAsync hook
  // that flips a state value once it resolves. Wait for that result to be
  // reflected in the DOM so the state update stays wrapped in act.
  if (activeTab === "Parameters" || activeTab === "Look and Feel") {
    // These tabs render the live preview, whose iframe only appears once the
    // signed URL has been computed.
    await screen.findByTestId("embed-preview-iframe");
  } else {
    // The Overview tab has no live preview; wait for the generated embed code
    // to be present, which settles the pane's mount-time async work.
    await screen.findAllByTestId("text-editor-mock");
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
