import _userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/collections/constants";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { RecentItem, SearchPromptEntity } from "metabase-types/api";
import {
  createMockCollection,
  createMockRecentCollectionItem,
} from "metabase-types/api/mocks";

import { SearchPromptsPage } from "./SearchPromptsPage";

const userEvent = _userEvent.setup();

const PROMPTS: SearchPromptEntity[] = [
  {
    id: 1,
    prompt: "active users",
    type: "sources",
    entities: [{ model: "metric", id: 10, name: "Active users" }],
    verified: true,
  },
  {
    id: 2,
    prompt: "revenue by month",
    type: "canonical",
    entities: [],
    verified: false,
  },
];

const RECENT_ITEMS: RecentItem[] = [
  createMockRecentCollectionItem({
    id: 100,
    model: "card",
    name: "Reporting Card",
  }),
  createMockRecentCollectionItem({
    id: 101,
    model: "card",
    name: "Analytics Card",
  }),
];

type SetupOpts = {
  prompts?: SearchPromptEntity[];
  error?: boolean;
};

const setup = ({ prompts = PROMPTS, error = false }: SetupOpts = {}) => {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  if (error) {
    fetchMock.get("path:/api/metabot/search-prompt/", 500);
  } else {
    for (const type of ["sources", "canonical"] as const) {
      const filtered = prompts.filter((p) => p.type === type);
      fetchMock.get({
        url: "path:/api/metabot/search-prompt/",
        query: { type },
        response: {
          data: filtered,
          total: filtered.length,
          limit: 10,
          offset: 0,
        },
      });
    }
  }

  fetchMock.post(
    "path:/api/metabot/search-prompt/",
    (_url: string, call: { body?: string }) => {
      const body = JSON.parse(String(call.body ?? "{}"));
      return {
        id: 99,
        verified: false,
        entities: [],
        type: "sources",
        ...body,
      };
    },
  );
  fetchMock.put(
    "path:/api/metabot/search-prompt/1",
    (_url: string, call: { body?: string }) => {
      const body = JSON.parse(String(call.body ?? "{}"));
      return { ...PROMPTS[0], ...body };
    },
  );
  fetchMock.delete("path:/api/metabot/search-prompt/2", 204);

  // endpoints required by the entity picker modal
  setupRecentViewsAndSelectionsEndpoints(RECENT_ITEMS, ["selections", "views"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection(ROOT_COLLECTION),
  });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: 1, name: "Collection" })],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: 1, name: "Collection" }),
    collectionItems: [],
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  fetchMock.get("path:/api/search", { data: [], total: 0 });
  fetchMock.get("path:/api/user/recipients", { data: [] });
  fetchMock.get("path:/api/ee/library", { message: "not found" });

  renderWithProviders(
    <>
      <SearchPromptsPage />
      <UndoListing />
    </>,
  );
};

const lastBody = (matcher: string, method: string) => {
  const calls = fetchMock.callHistory.calls(matcher, { method });
  const lastCall = calls[calls.length - 1];
  return JSON.parse(String(lastCall?.options?.body ?? "{}"));
};

// canonical section renders first, sources second
const openNewPromptModal = async (section: "canonical" | "sources") => {
  const addButtons = await screen.findAllByRole("button", {
    name: /New search prompt/,
  });
  await userEvent.click(addButtons[section === "canonical" ? 0 : 1]);
};

const pickEntity = async (name: string) => {
  await userEvent.click(await screen.findByRole("button", { name: /entity/i }));
  await userEvent.click(await screen.findByText(name));
};

describe("SearchPromptsPage", () => {
  it("renders each section with its prompts, entities, and verified icon", async () => {
    setup();

    // sources section
    expect(await screen.findByText("active users")).toBeInTheDocument();
    expect(screen.getByText("Active users")).toBeInTheDocument();

    // canonical section
    expect(screen.getByText("revenue by month")).toBeInTheDocument();

    // only the verified row shows the verified icon
    expect(screen.getAllByTestId("search-prompt-verified")).toHaveLength(1);
  });

  it("renders the canonical section before the sources section", async () => {
    setup();

    const headings = await screen.findAllByText(/Canonical entity|Sources/);
    expect(headings.map((node) => node.textContent)).toEqual([
      "Canonical entity",
      "Sources",
    ]);
  });

  it("shows the empty state when there are no prompts", async () => {
    setup({ prompts: [] });

    const emptyMessages = await screen.findAllByText("No search prompts yet.");
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the error state when the list request fails", async () => {
    setup({ error: true });

    const errorMessages = await screen.findAllByText("Something went wrong.");
    expect(errorMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("disables saving until an entity is provided", async () => {
    setup({ prompts: [] });

    await openNewPromptModal("sources");
    await userEvent.type(await screen.findByRole("textbox"), "new prompt");

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();

    await pickEntity("Reporting Card");

    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("creates a sources prompt with multiple entities", async () => {
    setup({ prompts: [] });

    await openNewPromptModal("sources");
    await userEvent.type(await screen.findByRole("textbox"), "new prompt");
    await pickEntity("Reporting Card");
    await pickEntity("Analytics Card");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/metabot/search-prompt/", {
          method: "POST",
        }),
      ).toBe(true);
    });
    expect(lastBody("path:/api/metabot/search-prompt/", "POST")).toEqual({
      prompt: "new prompt",
      entities: [
        { model: "card", id: 100, name: "Reporting Card" },
        { model: "card", id: 101, name: "Analytics Card" },
      ],
      verified: false,
      type: "sources",
    });
  });

  it("limits a canonical prompt to a single entity", async () => {
    setup({ prompts: [] });

    await openNewPromptModal("canonical");
    expect(await screen.findByText("Entity")).toBeInTheDocument();

    await pickEntity("Reporting Card");

    // once an entity exists, canonical hides the add control
    expect(
      screen.queryByRole("button", { name: /entity/i }),
    ).not.toBeInTheDocument();
  });

  it("edits the prompt, entities, and verified status", async () => {
    setup();

    await userEvent.click(await screen.findByText("active users"));
    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "renamed prompt");
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/metabot/search-prompt/1", {
          method: "PUT",
        }),
      ).toBe(true);
    });
    expect(lastBody("path:/api/metabot/search-prompt/1", "PUT")).toEqual({
      prompt: "renamed prompt",
      entities: PROMPTS[0].entities,
      verified: false,
    });
  });

  it("deletes a search prompt after confirmation", async () => {
    setup();

    // canonical section renders first, so its row ("revenue by month", id 2) is first
    await userEvent.click(
      (await screen.findAllByTestId("search-prompt-delete"))[0],
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/metabot/search-prompt/2", {
          method: "DELETE",
        }),
      ).toBe(true);
    });
  });
});
