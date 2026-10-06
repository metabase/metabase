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

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/llm/models")).toHaveLength(
        1,
      ),
    );
  });

  it("warns that removing the openai connection also turns off semantic search", async () => {
    setup();

    const modal = await openRemoveDialog("openai");

    expect(
      within(modal).getByText(/Semantic search also runs on this connection/),
    ).toBeInTheDocument();
    expect(
      within(modal).getByText(/saved credentials will be deleted/),
    ).toBeInTheDocument();
  });

  it("does not warn about dependent features when removing the anthropic connection", async () => {
    setup();

    const modal = await openRemoveDialog("anthropic");

    expect(
      within(modal).getByText(/saved credentials will be deleted/),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByText(/also runs on this connection/),
    ).not.toBeInTheDocument();
  });

  it("shows the skeleton until the connections have loaded", async () => {
    setup();

    expect(screen.getByTestId("provider-list-skeleton")).toBeInTheDocument();

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-list-skeleton"),
    ).not.toBeInTheDocument();
  });
});

async function openRemoveDialog(key: string) {
  const row = await screen.findByTestId(`provider-${key}`);
  await userEvent.click(within(row).getByLabelText("Provider options"));
  await userEvent.click(await screen.findByText("Remove"));
  return screen.findByRole("dialog", { name: "Remove this provider?" });
}
