import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { EmbedResource } from "../types";
import type { EmbedModalContentProps } from "./EmbedModalContent";
import { EmbedModalContent } from "./EmbedModalContent";

const TextEditorMock = ({ value }: { value: string }) => (
  <div data-testid="text-editor-mock">{value}</div>
);

jest.mock("metabase/components/TextEditor", () => TextEditorMock);

describe("EmbedModalContent", () => {
  describe("Select Embed Type phase", () => {
    it("should render", () => {
      setup();

      expect(screen.getByText("Static embed")).toBeInTheDocument();
      expect(screen.getByText("Public embed")).toBeInTheDocument();
    });
  });

  describe("Static Embed Setup phase", () => {
    describe("Parameters tab", () => {
      it("should render Code mode by default", () => {
        setup({
          props: {
            embedType: "application",
          },
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
            embedType: "application",
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
            embedType: "application",
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
            embedType: "application",
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
            embedType: "application",
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

        screen.getByLabelText("My param").click();

        screen.getByText("Locked").click();

        screen.getByRole("button", { name: "Publish changes" }).click();

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
            embedType: "application",
            resource: dashboard,
            resourceParameters: [dateParameter],
          },
          activeTab: "Parameters",
        });

        screen.getByLabelText("Month and Year").click();

        screen.getByText("Locked").click();

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `var payload = { resource: { dashboard: ${dashboard.id} }, params: { "${dateParameter.slug}": null }, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration };`,
        );
      });

      it("should switch to Preview mode if user changes locked parameter value", () => {
        setup({
          props: {
            embedType: "application",
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
          props: {
            embedType: "application",
          },
          activeTab: "Appearance",
        });

        expect(screen.getByLabelText("Code")).toBeChecked();
      });
    });
  });
});

function setup(
  {
    props: {
        embedType = null,
        resource = {} as EmbedResource,
        resourceType = "dashboard",
        resourceParameters = [],
        setEmbedType = jest.fn(),
        getPublicUrl = jest.fn(_resource => "some URL"),
        onUpdateEmbeddingParams = jest.fn(),
        onUpdateEnableEmbedding = jest.fn(),
        onCreatePublicLink = jest.fn(),
        onDeletePublicLink = jest.fn(),
    },
    activeTab = "Overview",
  }: {
    props: Partial<EmbedModalContentProps>;
    activeTab?: "Overview" | "Parameters" | "Appearance";
  } = {
    props: {},
  },
) {
    const view = renderWithProviders(
    <EmbedModalContent
      embedType={embedType}
      setEmbedType={setEmbedType}
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      getPublicUrl={getPublicUrl}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
      onCreatePublicLink={onCreatePublicLink}
      onDeletePublicLink={onDeletePublicLink}
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

  if (embedType === "application" && activeTab && activeTab !== "Overview") {
    userEvent.click(
      screen.getByRole("tab", {
        name: activeTab,
      }),
    );
  }

    return {
        ...view,
        setEmbedType,
        getPublicUrl,
        onUpdateEmbeddingParams,
        onUpdateEnableEmbedding,
        onCreatePublicLink,
        onDeletePublicLink,
    };
}
