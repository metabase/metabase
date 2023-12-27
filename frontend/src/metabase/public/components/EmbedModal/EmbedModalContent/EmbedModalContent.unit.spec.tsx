import { screen, waitFor, within } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { EmbedResource } from "../EmbedModal.types";
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
      resourceParameters: [
        {
          id: "my_param",
          name: "My param",
          slug: "my_param",
          type: "category",
        },
      ],
    });

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should render saved parameters", () => {
    setup({
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

    openEmbedModal();
    const parametersSection = screen.getByRole("region", {
      name: "Parameters",
    });
    expect(within(parametersSection).getByText("My param")).toBeInTheDocument();
    expect(
      within(parametersSection).getByLabelText("My param"),
    ).toHaveTextContent("Locked");
  });

  it("should only render valid parameters", () => {
    setup({
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

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should update a card with only valid parameters", async () => {
    const { mocks } = setup({
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

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
    screen.getByLabelText("My param").click();
    screen.getByText("Locked").click();
    screen.getByRole("button", { name: "Publish" }).click();
    await waitFor(() =>
      expect(mocks.onUpdateEmbeddingParams).toHaveBeenCalledWith({
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
  getPublicUrl,
}: Partial<EmbedModalContentProps> = {}) {
  const mocks = {
    setEmbedType: jest.fn(),
    getPublicUrl: getPublicUrl || jest.fn(_resource => "some URL"),
    onUpdateEmbeddingParams: jest.fn(),
    onUpdateEnableEmbedding: jest.fn(),
    onClose: jest.fn(),
    onCreatePublicLink: jest.fn(),
    onDeletePublicLink: jest.fn(),
  };

  const view = renderWithProviders(
    <EmbedModalContent
      embedType={embedType}
      setEmbedType={mocks.setEmbedType}
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      getPublicUrl={mocks.getPublicUrl}
      onUpdateEmbeddingParams={mocks.onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={mocks.onUpdateEnableEmbedding}
      onCreatePublicLink={mocks.onCreatePublicLink}
      onDeletePublicLink={mocks.onDeletePublicLink}
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

  return { mocks, view };
}

function openEmbedModal() {
  screen
    .getByRole("button", {
      name: "Set this up",
    })
    .click();
}
