import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import {
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { LlmConnectionModels } from "metabase-types/api";
import {
  createMockLlmConnectionModels,
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIProviderList } from "./AIProviderList";

const setup = ({
  usable = true,
  models = [],
}: { usable?: boolean; models?: LlmConnectionModels[] } = {}) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings();
  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([]);
  setupLlmProviderTypesEndpoint([createMockLlmProviderType()]);
  setupLlmProvidersEndpoint([
    createMockLlmProviderConnection({
      key: "anthropic",
      type: "anthropic",
      name: "Anthropic",
      usable,
    }),
    createMockLlmProviderConnection({
      key: "openai",
      type: "openai",
      name: "OpenAI",
    }),
  ]);
  setupLlmModelsEndpoint(models);

  renderWithProviders(<AIProviderList />, {
    storeInitialState: {
      settings: mockSettings(sessionProperties),
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

describe("AIProviderList", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("does not badge a connection that has everything it needs", async () => {
    setup({ usable: true });

    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Incomplete configuration"),
    ).not.toBeInTheDocument();
  });

  it("warns about a connection that is missing required settings", async () => {
    setup({ usable: false });

    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Incomplete configuration"),
    ).toBeInTheDocument();
  });

  it("shows a model-loading failure on the provider it belongs to", async () => {
    setup({
      models: [
        createMockLlmConnectionModels({
          key: "anthropic",
          name: "Anthropic",
          type: "anthropic",
          models: [],
          error: "Anthropic API key expired or invalid",
        }),
        createMockLlmConnectionModels({
          key: "openai",
          name: "OpenAI",
          type: "openai",
        }),
      ],
    });

    expect(
      await within(await screen.findByTestId("provider-anthropic")).findByText(
        "Anthropic API key expired or invalid",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("provider-openai")).queryByText(
        "Anthropic API key expired or invalid",
      ),
    ).not.toBeInTheDocument();
  });

  it("fetches the models for every provider in a single shared request", async () => {
    setup({
      models: [
        createMockLlmConnectionModels({ key: "anthropic", name: "Anthropic" }),
      ],
    });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(await screen.findByText("Model")).toBeInTheDocument();

    expect(fetchMock.callHistory.calls("path:/api/llm/models")).toHaveLength(1);
  });

  it("reopens the add modal on a fresh form rather than the last provider picked", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: /Add another provider/ }),
    );
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: /Anthropic/ }),
    );
    expect(await within(modal).findByLabelText(/API key/)).toBeInTheDocument();

    await userEvent.click(within(modal).getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Add another provider/ }),
    );
    const reopened = await screen.findByRole("dialog");
    expect(
      within(reopened).getByRole("button", { name: /Anthropic/ }),
    ).toBeInTheDocument();
    expect(
      within(reopened).queryByLabelText(/API key/),
    ).not.toBeInTheDocument();
  });

  it("closes the edit modal", async () => {
    setup();

    const row = await screen.findByTestId("provider-anthropic");
    await userEvent.click(
      within(row).getByRole("button", { name: "Provider options" }),
    );
    await userEvent.click(await screen.findByText("Edit"));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Edit provider")).toBeInTheDocument();

    await userEvent.click(within(modal).getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
