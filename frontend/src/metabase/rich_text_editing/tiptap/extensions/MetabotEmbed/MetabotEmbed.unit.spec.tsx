import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { DatasetQuery } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { MetabotComponent, getChartAndQueryFromState } from "./MetabotEmbed";
import {
  createMockExtension,
  createMockNodeViewProps,
  createMockProseMirrorNode,
} from "./__support__/node-view-mocks";

describe("MetabotEmbed", () => {
  const defaultProps = createMockNodeViewProps({
    node: createMockProseMirrorNode({
      textContent: "Test prompt",
      content: { content: [] },
    }),
    extension: createMockExtension(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
    mockSettings({
      "token-features": createMockTokenFeatures({ ai_controls: true }),
    });
    setupEnterprisePlugins();
  });

  describe("when metabot is disabled", () => {
    it("should show disabled button with tooltip", async () => {
      renderWithProviders(<MetabotComponent {...defaultProps} />, {
        storeInitialState: createMockState({
          settings: mockSettings({
            "metabot-enabled?": false,
          }),
        }),
      });

      const runButton = screen.getByRole("button", { name: /run/i });
      expect(runButton).toBeDisabled();

      await userEvent.hover(runButton);
      const tooltip = await screen.findByRole("tooltip");
      expect(
        within(tooltip).getByText("Metabot is disabled"),
      ).toBeInTheDocument();
    });
  });

  describe("when metabot is enabled", () => {
    it("should show enabled button without tooltip", async () => {
      renderWithProviders(<MetabotComponent {...defaultProps} />, {
        storeInitialState: createMockState({
          settings: mockSettings({
            "metabot-enabled?": true,
            "llm-metabot-configured?": true,
          }),
        }),
      });

      const runButton = screen.getByRole("button", { name: /run/i });
      await waitFor(() => expect(runButton).toBeEnabled());

      await userEvent.hover(runButton);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});

describe("getChartAndQueryFromState", () => {
  const query: DatasetQuery = {
    database: 1,
    type: "native",
    native: {
      query: "select 1",
      "template-tags": {},
    },
  };

  it("returns chart drafts with inline queries", () => {
    const chart = {
      chart_id: "c-1",
      chart_name: "Test chart",
      chart_description: "Test description",
      queries: [query],
      visualization_settings: {
        chart_type: "bar" as const,
      },
    };

    expect(
      getChartAndQueryFromState({
        charts: { "c-1": chart },
      }),
    ).toEqual([{ chart, query }]);
  });
});
