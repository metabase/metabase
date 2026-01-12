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
} from "metabase/public/lib/types";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { StaticEmbedSetupPaneProps } from "../StaticEmbedSetupPane";
import { StaticEmbedSetupPane } from "../StaticEmbedSetupPane";

const TextEditorMock = ({
  highlightRanges,
  value,
}: {
  highlightRanges?: { start: number; end: number }[];
  value: string;
}) => {
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
};

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
