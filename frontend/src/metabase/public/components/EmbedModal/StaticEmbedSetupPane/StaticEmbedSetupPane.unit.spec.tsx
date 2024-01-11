import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import type { EmbedResource } from "metabase/public/lib/types";
import { renderWithProviders } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { StaticEmbedSetupPaneProps } from "./StaticEmbedSetupPane";
import { StaticEmbedSetupPane } from "./StaticEmbedSetupPane";

describe("Static Embed Setup phase", () => {
  describe("Parameters tab", () => {
    it("should render Code mode by default", () => {
      setup({
        props: {},
        activeTab: "Parameters",
      });

      expect(screen.getByLabelText("Code")).toBeChecked();
      expect(
        screen.getByText(
          "If there’s any code you need to change, we’ll show you that here.",
        ),
      ).toBeVisible();
    });

    it("should render unsaved parameters", () => {
      setup({
        props: {
          resourceParameters: [
            {
              id: "my_param",
              name: "My param",
              slug: "my_param",
              type: "category",
            },
          ],
        },
        activeTab: "Parameters",
      });

      expect(screen.getByText("My param")).toBeInTheDocument();
      expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
    });

    it("should render saved parameters", () => {
      setup({
        props: {
          resource: {
            ...createMockDashboard(),
            embedding_params: {
              my_param: "locked",
            },
          },
          resourceParameters: [
            {
              id: "my_param",
              name: "My param",
              slug: "my_param",
              type: "category",
            },
          ],
        },
        activeTab: "Parameters",
      });

      const parametersSection = screen.getByLabelText(
        "Enable or lock parameters",
      );
      expect(
        within(parametersSection).getByText("My param"),
      ).toBeInTheDocument();
      expect(
        within(parametersSection).getByLabelText("My param"),
      ).toHaveTextContent("Locked");
    });

    it("should only render valid parameters", () => {
      setup({
        props: {
          resource: {
            ...createMockDashboard(),
            embedding_params: {
              old_param: "locked",
            },
          },
          resourceParameters: [
            {
              id: "my_param",
              name: "My param",
              slug: "my_param",
              type: "category",
            },
          ],
        },
        activeTab: "Parameters",
      });

      expect(screen.getByText("My param")).toBeInTheDocument();
      expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
    });

    it("should update a card with only valid parameters", async () => {
      const { onUpdateEmbeddingParams } = setup({
        props: {
          resource: {
            ...createMockDashboard(),
            embedding_params: {
              old_param: "locked",
            },
          },
          resourceParameters: [
            {
              id: "my_param",
              name: "My param",
              slug: "my_param",
              type: "category",
            },
          ],
        },
        activeTab: "Parameters",
      });

      expect(screen.getByText("My param")).toBeInTheDocument();
      expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");

      userEvent.click(screen.getByLabelText("My param"));

      userEvent.click(screen.getByText("Locked"));

      userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

      await waitFor(() =>
        expect(onUpdateEmbeddingParams).toHaveBeenCalledWith({
          my_param: "locked",
        }),
      );
    });

    it("should render code diff on parameters change", () => {
      const dashboard = createMockDashboard();
      const dateParameter = {
        id: "5cd742ef",
        name: "Month and Year",
        slug: "month_and_year",
        type: "date/month-year",
      };

      setup({
        props: {
          resource: dashboard,
          resourceParameters: [dateParameter],
        },
        activeTab: "Parameters",
      });

      userEvent.click(screen.getByLabelText("Month and Year"));

      userEvent.click(screen.getByText("Locked"));

      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `var payload = { resource: { dashboard: ${dashboard.id} }, params: { "${dateParameter.slug}": null }, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration };`,
      );
    });

    it("should switch to Preview mode if user changes locked parameter value", () => {
      setup({
        props: {
          resource: {
            ...createMockDashboard(),
            embedding_params: {
              month_and_year: "locked",
            },
          },
          resourceParameters: [
            {
              id: "5cd742ef",
              name: "Month and Year",
              slug: "month_and_year",
              type: "date/month-year",
            },
          ],
        },
        activeTab: "Parameters",
      });

      userEvent.click(
        within(screen.getByLabelText("Preview locked parameters")).getByRole(
          "button",
          { name: "Month and Year" },
        ),
      );

      userEvent.click(screen.getByText("February"));

      expect(screen.getByLabelText("Preview")).toBeChecked();
      expect(screen.getByTestId("embed-preview-iframe")).toBeVisible();
    });
  });

  describe("Appearance tab", () => {
    it("should render Code mode by default", () => {
      setup({
        props: {},
        activeTab: "Appearance",
      });

      expect(screen.getByLabelText("Code")).toBeChecked();
      expect(
        screen.getByText(
          "If there’s any code you need to change, we’ll show you that here.",
        ),
      ).toBeVisible();
    });

    it("should render code diff on settings change", () => {
      setup({
        props: {
          resource: createMockDashboard(),
        },
        activeTab: "Appearance",
      });

      userEvent.click(screen.getByText("Transparent"));
      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#theme=transparent&bordered=true&titled=true";`,
      );

      userEvent.click(screen.getByText("Dashboard title"));
      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#theme=transparent&bordered=true&titled=false";`,
      );
    });
  });
});

function setup(
  {
    props: {
      resource = {} as EmbedResource,
      resourceType = "dashboard",
      resourceParameters = [],
      onUpdateEmbeddingParams = jest.fn(),
      onUpdateEnableEmbedding = jest.fn(),
    },
    activeTab = "Overview",
  }: {
    props: Partial<StaticEmbedSetupPaneProps>;
    activeTab?: "Overview" | "Parameters" | "Appearance";
  } = {
    props: {},
  },
) {
  const view = renderWithProviders(
    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings: createMockSettingsState({
          "enable-embedding": true,
          "embedding-secret-key": "my_super_secret_key",
        }),
      },
    },
  );

  if (activeTab && activeTab !== "Overview") {
    userEvent.click(
      screen.getByRole("tab", {
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
