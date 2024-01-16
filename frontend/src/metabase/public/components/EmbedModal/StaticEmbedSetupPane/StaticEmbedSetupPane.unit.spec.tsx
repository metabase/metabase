import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import type { EmbedResource } from "metabase/public/lib/types";
import { renderWithProviders } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { StaticEmbedSetupPaneProps } from "./StaticEmbedSetupPane";
import { StaticEmbedSetupPane } from "./StaticEmbedSetupPane";

const TextEditorMock = ({ value }: { value: string }) => (
  <div data-testid="text-editor-mock">{value}</div>
);

jest.mock("metabase/components/TextEditor", () => TextEditorMock);

describe("Static Embed Setup phase", () => {
  describe("Overview tab", () => {
    it("should render content", () => {
      setup({
        props: {},
        activeTab: "Overview",
      });

      expect(screen.getByText("Setting up a static embed")).toBeVisible();

      const link = screen.getByRole("link", {
        name: "documentation",
      });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/embedding/static-embedding.html",
      );

      expect(
        screen.getByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        ),
      ).toBeVisible();

      expect(
        screen.getByText(
          "Then insert this code snippet in your HTML template or single page app.",
        ),
      ).toBeVisible();
    });
  });

  describe("Parameters tab", () => {
    it("should render Code mode by default", () => {
      const dashboard = createMockDashboard();
      setup({
        props: {
          resource: dashboard,
        },
        activeTab: "Parameters",
      });

      expect(screen.getByLabelText("Code")).toBeChecked();

      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `// you will need to install via 'npm install jsonwebtoken' or in your package.json var jwt = require("jsonwebtoken"); var METABASE_SITE_URL = "http://localhost:3000"; var METABASE_SECRET_KEY = "my_super_secret_key"; var payload = { resource: { dashboard: 1 }, params: {}, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration }; var token = jwt.sign(payload, METABASE_SECRET_KEY); var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`,
      );
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

      const parametersSection = screen.getByLabelText("Configuring parameters");
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
            enable_embedding: true,
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

    it("should render changed code on parameters change", () => {
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

      expect(
        screen.getByText(
          "In addition to publishing changes, update the params in the payload, like this:",
        ),
      ).toBeVisible();

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
        within(screen.getByLabelText("Previewing locked parameters")).getByRole(
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
      const dashboard = createMockDashboard();
      setup({
        props: {
          resource: dashboard,
        },
        activeTab: "Appearance",
      });

      expect(screen.getByLabelText("Code")).toBeChecked();

      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `// you will need to install via 'npm install jsonwebtoken' or in your package.json var jwt = require("jsonwebtoken"); var METABASE_SITE_URL = "http://localhost:3000"; var METABASE_SECRET_KEY = "my_super_secret_key"; var payload = { resource: { dashboard: 1 }, params: {}, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration }; var token = jwt.sign(payload, METABASE_SECRET_KEY); var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`,
      );
    });

    it("should render code diff on settings change", () => {
      setup({
        props: {
          resource: createMockDashboard(),
        },
        activeTab: "Appearance",
      });

      userEvent.click(screen.getByText("Transparent"));

      expect(
        screen.getByText("Here’s the code you’ll need to alter:"),
      ).toBeVisible();

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
