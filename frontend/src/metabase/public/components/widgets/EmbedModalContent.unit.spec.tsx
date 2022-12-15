import React from "react";
import { screen, waitFor } from "@testing-library/react";
import _ from "underscore";
import { renderWithProviders } from "__support__/ui";
import EmbedModalContent from "./EmbedModalContent";

describe("EmbedModalContent", () => {
  it("should render", () => {
    renderWithConfiguredProviders(
      <EmbedModalContent
        resource={{}}
        resourceParameters={[]}
        getPublicUrl={jest.fn()}
      />,
    );

    expect(screen.getByText("Sharing")).toBeInTheDocument();
    expect(screen.getByText("Public link")).toBeInTheDocument();
    expect(screen.getByText("Public embed")).toBeInTheDocument();
    expect(screen.getByText("Embed in your application")).toBeInTheDocument();
  });

  it("should render parameters", () => {
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];

    renderWithConfiguredProviders(
      <EmbedModalContent
        resource={{}}
        resourceParameters={parameters}
        getPublicUrl={jest.fn()}
      />,
    );

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should render unsaved parameters", () => {
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];

    renderWithConfiguredProviders(
      <EmbedModalContent
        resource={{}}
        resourceParameters={parameters}
        getPublicUrl={jest.fn()}
      />,
    );

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should render saved parameters", () => {
    const resource = {
      embedding_params: {
        my_param: "locked",
      },
    };
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];

    renderWithConfiguredProviders(
      <EmbedModalContent
        resource={resource}
        resourceParameters={parameters}
        getPublicUrl={jest.fn()}
      />,
    );

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Locked");
  });

  it("should only render valid parameters", () => {
    const resource = {
      embedding_params: {
        old_param: "locked",
      },
    };
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];

    renderWithConfiguredProviders(
      <EmbedModalContent
        resource={resource}
        resourceParameters={parameters}
        getPublicUrl={jest.fn()}
      />,
    );

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
  });

  it("should update a card with only valid parameters", async () => {
    const resource = {
      embedding_params: {
        old_param: "locked",
      },
    };
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];
    const onUpdateEmbeddingParams = jest.fn();

    renderWithConfiguredProviders(
      <EmbedModalContent
        resource={resource}
        resourceParameters={parameters}
        onUpdateEmbeddingParams={onUpdateEmbeddingParams}
        onUpdateEnableEmbedding={jest.fn()}
        getPublicUrl={jest.fn()}
      />,
    );

    openEmbedModal();
    expect(screen.getByText("My param")).toBeInTheDocument();
    expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
    screen.getByLabelText("My param").click();
    screen.getByText("Locked").click();
    screen.getByRole("button", { name: "Publish" }).click();
    await waitFor(() =>
      expect(onUpdateEmbeddingParams).toHaveBeenCalledWith({
        my_param: "locked",
      }),
    );
  });
});

const storeInitialState = {
  currentUser: {
    is_superuser: true,
  },
  settings: {
    values: {
      "enable-embedding": true,
      "embedding-secret-key": "my_super_secret_key",
    },
  },
};

function renderWithConfiguredProviders(element: JSX.Element) {
  renderWithProviders(element, {
    storeInitialState,
    reducers: {
      settings: (state: Record<string, any> = storeInitialState.settings) => {
        return state;
      },
    },
  });
}

function openEmbedModal() {
  screen
    .getByRole("button", {
      name: "Set up",
    })
    .click();
}
