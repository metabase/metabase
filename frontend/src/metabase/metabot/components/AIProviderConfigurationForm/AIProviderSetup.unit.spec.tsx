import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateLlmProviderEndpoint,
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { LlmProviderConnection } from "metabase-types/api";
import {
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettings,
} from "metabase-types/api/mocks";

import { AIProviderSetup } from "./AIProviderSetup";

function setup({
  connections = [],
  startOnConnectionForm = false,
}: {
  connections?: LlmProviderConnection[];
  startOnConnectionForm?: boolean;
} = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupLlmProviderTypesEndpoint([createMockLlmProviderType()]);
  setupLlmProvidersEndpoint(connections);
  setupLlmModelsEndpoint([]);
  setupCreateLlmProviderEndpoint();
  const onDone = jest.fn();

  renderWithProviders(
    <AIProviderSetup
      onDone={onDone}
      startOnConnectionForm={startOnConnectionForm}
    />,
  );

  return { onDone };
}

describe("AIProviderSetup", () => {
  it("starts on the model picker when a usable provider is already connected", async () => {
    const { onDone } = setup({
      connections: [createMockLlmProviderConnection()],
    });

    expect(await screen.findByLabelText("Model")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("can start on the connection form even when a provider is already connected", async () => {
    setup({
      connections: [createMockLlmProviderConnection()],
      startOnConnectionForm: true,
    });

    expect(
      await screen.findByRole("button", { name: "Anthropic" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("shows the model picker after connecting a third-party provider", async () => {
    const { onDone } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Anthropic" }),
    );
    await userEvent.type(await screen.findByLabelText(/API key/), "test-key");
    setupLlmProvidersEndpoint([createMockLlmProviderConnection()]);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByLabelText("Model")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
