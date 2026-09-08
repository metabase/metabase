import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { setupLlmProviderEndpoints } from "__support__/server-mocks/metabot";
import { findRequests } from "__support__/server-mocks/util";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  LlmConnectionModels,
  LlmProviderConnection,
} from "metabase-types/api";
import {
  createMockLlmConnectionModels,
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIProviderList } from "./AIProviderList";

type SetupOpts = {
  usable?: boolean;
  models?: LlmConnectionModels[];
  connections?: LlmProviderConnection[];
};

const setup = ({ usable = true, models = [], connections }: SetupOpts = {}) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings();
  setupPropertiesEndpoints(sessionProperties);
  setupLlmProviderEndpoints({
    types: [createMockLlmProviderType()],
    connections: connections ?? [
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
    ],
    models,
  });

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

  it.each([
    ["anthropic", "SQL generation also runs on this connection"],
    ["openai", "Semantic search also runs on this connection"],
  ])(
    "warns that removing the %s connection also turns off the feature reading it",
    async (key, warning) => {
      setup();

      const row = await screen.findByTestId(`provider-${key}`);
      await userEvent.click(within(row).getByLabelText("Provider options"));
      await userEvent.click(await screen.findByText("Remove"));

      const modal = await screen.findByRole("dialog", {
        name: "Remove this provider?",
      });
      expect(within(modal).getByText(new RegExp(warning))).toBeInTheDocument();
      expect(
        within(modal).getByText(/saved credentials will be deleted/),
      ).toBeInTheDocument();
    },
  );

  it("shows the stored failure the backend reports for a provider", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          type: "anthropic",
          name: "Anthropic",
          error: { message: "invalid x-api-key", fatal: true },
        }),
        createMockLlmProviderConnection({
          key: "openai",
          type: "openai",
          name: "OpenAI",
        }),
      ],
    });

    expect(
      await within(await screen.findByTestId("provider-anthropic")).findByText(
        "invalid x-api-key",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("provider-openai")).queryByText(
        "invalid x-api-key",
      ),
    ).not.toBeInTheDocument();
  });

  it("offers a drag handle for every connection whose position can be saved", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          name: "Anthropic",
        }),
        createMockLlmProviderConnection({
          key: "openai",
          type: "openai",
          name: "OpenAI",
        }),
        createMockLlmProviderConnection({
          key: "mistral",
          type: "mistral",
          name: "Mistral",
          source: "env",
          reorderable: false,
        }),
      ],
    });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(screen.getByLabelText("Reorder Anthropic")).toBeInTheDocument();
    expect(screen.getByLabelText("Reorder OpenAI")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reorder Mistral")).not.toBeInTheDocument();
  });

  it("lets the keyboard set the provider order through the drag handle", async () => {
    // dnd-kit's keyboard moves are computed from element rects, which jsdom reports as all-zero — derive a
    // vertical stack from sibling order so "down" means something
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        let index = 0;
        // eslint-disable-next-line testing-library/no-node-access -- synthesizing layout, not querying for assertions
        let sibling = this.previousElementSibling;
        while (sibling) {
          index += 1;
          // eslint-disable-next-line testing-library/no-node-access -- synthesizing layout, not querying for assertions
          sibling = sibling.previousElementSibling;
        }
        const top = index * 50;
        // cast: jsdom offers no way to construct a real DOMRect from plain fields, and dnd-kit only reads
        // the geometry below
        return {
          x: 0,
          y: top,
          top,
          bottom: top + 50,
          left: 0,
          right: 100,
          width: 100,
          height: 50,
          toJSON: () => {},
        } as DOMRect;
      });
    window.HTMLElement.prototype.scrollIntoView = jest.fn();

    setup();

    const handle = await screen.findByLabelText("Reorder Anthropic");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("aria-describedby");

    handle.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toEqual([
        expect.objectContaining({
          url: expect.stringContaining("/provider-order"),
          body: { order: ["openai", "anthropic"] },
        }),
      ]);
    });

    jest.restoreAllMocks();
  });

  it("does not offer reordering for a single connection", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          name: "Anthropic",
        }),
      ],
    });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-drag-handle"),
    ).not.toBeInTheDocument();
  });

  it("offers no fallback section without the enterprise plugin", async () => {
    setup();

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-fallback-settings"),
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
