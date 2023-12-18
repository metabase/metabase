import { screen, waitFor, within } from "@testing-library/react";

import { useState } from "react";
import { renderWithProviders } from "__support__/ui";
import type { Parameter } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import EmbedModalContent from "./EmbedModalContent";

const TestEmbedModalContent = ({
  resource,
  resourceParameters,
  getPublicUrl,
  onUpdateEmbeddingParams,
  onUpdateEnableEmbedding,
}: {
  resource: { embedding_params?: Record<string, unknown> };
  resourceParameters: Partial<Parameter>[];
  getPublicUrl: () => void;
  onUpdateEmbeddingParams?: () => void;
  onUpdateEnableEmbedding?: () => void;
}) => {
  const [embedType, setEmbedType] = useState(null);
  return (
    <EmbedModalContent
      resource={resource}
      resourceParameters={resourceParameters}
      getPublicUrl={getPublicUrl}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
      embedType={embedType}
      setEmbedType={setEmbedType}
    />
  );
};

describe("EmbedModalContent", () => {
  it("should render", () => {
    renderWithConfiguredProviders(
      <TestEmbedModalContent
        resource={{}}
        resourceParameters={[]}
        getPublicUrl={jest.fn()}
      />,
    );

    expect(screen.getByText("Public embed")).toBeInTheDocument();
    expect(screen.getByText("Static embed")).toBeInTheDocument();
  });

  it("should render parameters", () => {
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];

    renderWithConfiguredProviders(
      <TestEmbedModalContent
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
      <TestEmbedModalContent
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
      <TestEmbedModalContent
        resource={resource}
        resourceParameters={parameters}
        getPublicUrl={jest.fn()}
      />,
    );

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
    const resource = {
      embedding_params: {
        old_param: "locked",
      },
    };
    const parameters = [
      { name: "My param", slug: "my_param", type: "category" },
    ];

    renderWithConfiguredProviders(
      <TestEmbedModalContent
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
      <TestEmbedModalContent
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

function renderWithConfiguredProviders(element: JSX.Element) {
  renderWithProviders(element, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
      settings: createMockSettingsState({
        "enable-embedding": true,
        "embedding-secret-key": "my_super_secret_key",
      }),
    },
  });
}

function openEmbedModal() {
  screen
    .getByRole("button", {
      name: "Set this up",
    })
    .click();
}
