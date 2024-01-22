import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { EmbedResource } from "../types";
import type { EmbedModalContentProps } from "./EmbedModalContent";
import { EmbedModalContent } from "./EmbedModalContent";

describe("EmbedModalContent", () => {
  it("should render", () => {
    setup();

    expect(screen.getByText("Public embed")).toBeInTheDocument();
    expect(screen.getByText("Static embed")).toBeInTheDocument();
  });

  it("should render unsaved parameters", () => {
    setup({
      embedType: "application",
      resourceParameters: [
        {
          id: "my_param",
          name: "My param",
          slug: "my_param",
          type: "category",
        },
      ],
    });

    userEvent.click(
      screen.getByRole("tab", {
        name: "Parameters",
      }),
    );

    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should render saved parameters", () => {
    setup({
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
    });

    userEvent.click(
      screen.getByRole("tab", {
        name: "Parameters",
      }),
    );

    const parametersSection = screen.getByLabelText(
      "Enable or lock parameters",
    );
    expect(within(parametersSection).getByText("My param")).toBeInTheDocument();
    expect(
      within(parametersSection).getByLabelText("My param"),
    ).toHaveTextContent("Locked");
  });

  it("should only render valid parameters", () => {
    setup({
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
    });

    userEvent.click(
      screen.getByRole("tab", {
        name: "Parameters",
      }),
    );

    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should update a card with only valid parameters", async () => {
    const { onUpdateEmbeddingParams } = setup({
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
    });

    userEvent.click(
      screen.getByRole("tab", {
        name: "Parameters",
      }),
    );

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
});

function setup({
  embedType = null,
  resource = {} as EmbedResource,
  resourceType = "dashboard",
  resourceParameters = [],
  goToNextStep = jest.fn(),
  getPublicUrl = jest.fn(_resource => "some URL"),
  onUpdateEmbeddingParams = jest.fn(),
  onUpdateEnableEmbedding = jest.fn(),
  onCreatePublicLink = jest.fn(),
  onDeletePublicLink = jest.fn(),
}: Partial<EmbedModalContentProps> = {}) {
  const view = renderWithProviders(
    <EmbedModalContent
      embedType={embedType}
      goToNextStep={goToNextStep}
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

  return {
    ...view,
    goToNextStep,
    getPublicUrl,
    onUpdateEmbeddingParams,
    onUpdateEnableEmbedding,
    onCreatePublicLink,
    onDeletePublicLink,
  };
}
