import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { CreateCardRequest } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import {
  TEST_DB,
  TEST_MODEL_CARD,
  TEST_STRUCTURED_CARD,
  setup,
  triggerVisualizationQueryChange,
  waitForQueryToStart,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

const setupQuestion = async () => {
  setupListNotificationEndpoints({ card_id: TEST_STRUCTURED_CARD.id }, []);
  await setup({ card: TEST_STRUCTURED_CARD });
};

const getCreatedCard = (): CreateCardRequest => {
  const body = checkNotNull(
    fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" })
      ?.options.body,
  );
  return JSON.parse(body.toString());
};

const duplicateQuestion = async () => {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Duplicate/ }),
  );

  const modal = await screen.findByRole("dialog", { name: /Duplicate/ });
  await userEvent.click(
    within(modal).getByRole("button", { name: "Duplicate" }),
  );
  await waitFor(() => expect(modal).not.toBeInTheDocument());
};

const saveAsNewQuestion = async () => {
  await waitForSaveToBeEnabled();
  await userEvent.click(screen.getByText("Save"));

  const modal = await screen.findByTestId("save-question-modal");
  await userEvent.click(within(modal).getByText("Save as new question"));
  await userEvent.click(within(modal).getByText("Save"));
  await waitFor(() => expect(modal).not.toBeInTheDocument());
};

describe("QueryBuilder > saving a question based on another one", () => {
  it("marks a duplicate as a copy of the question it came from", async () => {
    await setupQuestion();

    await duplicateQuestion();

    expect(getCreatedCard().source_card_id).toBe(TEST_STRUCTURED_CARD.id);
  });

  it("marks an edited question saved as a new one as a copy of the original", async () => {
    await setupQuestion();

    await triggerVisualizationQueryChange();
    await saveAsNewQuestion();

    expect(getCreatedCard().source_card_id).toBe(TEST_STRUCTURED_CARD.id);
  });
});

describe("QueryBuilder > duplicating a model", () => {
  const FIRST_COLLECTION_ID = 11;
  const FIRST_COLLECTION = createMockCollection({
    id: FIRST_COLLECTION_ID,
    name: "First collection",
  });
  const MODEL = createMockCard({
    ...TEST_MODEL_CARD,
    id: 2,
    name: "Orders",
    collection_id: null,
  });
  const DUPLICATE_ID = 3;

  beforeEach(() => {
    // Renders every row of the virtualized collection picker in jsdom.
    process.env.OVERSCAN = "20";
  });

  afterEach(() => {
    delete process.env.OVERSCAN;
    jest.restoreAllMocks();
  });

  it("saves a copy of the model and opens it", async () => {
    mockGetBoundingClientRect();
    // Registered before `setup` so the picker lists the collection.
    fetchMock.get("path:/api/collection/tree", [FIRST_COLLECTION]);
    setupCollectionByIdEndpoint({ collections: [FIRST_COLLECTION] });
    setupRootCollectionItemsEndpoint({
      rootCollectionItems: [
        createMockCollectionItem({
          id: FIRST_COLLECTION_ID,
          model: "collection",
          name: FIRST_COLLECTION.name,
          here: ["card"],
          below: ["card"],
          collection_id: null,
          can_write: true,
        }),
      ],
    });
    setupCollectionItemsEndpoint({
      collection: FIRST_COLLECTION,
      collectionItems: [],
    });
    setupListNotificationEndpoints({ card_id: MODEL.id }, []);
    setupListNotificationEndpoints({ card_id: DUPLICATE_ID }, []);
    setupCardQueryMetadataEndpoint(
      createMockCard({ id: DUPLICATE_ID }),
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    // Registered before `setup` so this route wins over its card create mock.
    fetchMock.post("path:/api/card", (call) => {
      const body: unknown = JSON.parse(String(call.options.body));
      return createMockCard(
        Object.assign({}, body, {
          id: DUPLICATE_ID,
          collection: FIRST_COLLECTION,
        }),
      );
    });
    const { router } = await setup({
      card: MODEL,
      initialRoute: `/model/${MODEL.id}`,
    });

    await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Duplicate/ }),
    );
    const modal = await screen.findByRole("dialog", { name: /Duplicate/ });
    expect(within(modal).getByLabelText("Name")).toHaveValue(
      "Orders - Duplicate",
    );
    await userEvent.click(
      within(modal).getByLabelText(/Where do you want to save this/),
    );
    const picker = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(picker).findByText("Collections"));
    await userEvent.click(await within(picker).findByText("First collection"));
    await userEvent.click(
      within(picker).getByRole("button", { name: "Select this collection" }),
    );
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    await userEvent.click(
      within(modal).getByRole("button", { name: "Duplicate" }),
    );
    await waitFor(() => expect(modal).not.toBeInTheDocument());
    await waitForQueryToStart();

    expect(getCreatedCard()).toMatchObject({
      name: "Orders - Duplicate",
      type: "model",
      collection_id: FIRST_COLLECTION.id,
      source_card_id: MODEL.id,
    });
    await waitFor(() =>
      expect(router.location.pathname).toBe(
        `/model/${DUPLICATE_ID}-orders-duplicate`,
      ),
    );
    const header = screen.getByTestId("qb-header");
    expect(
      within(header).getByDisplayValue("Orders - Duplicate"),
    ).toBeInTheDocument();
    expect(
      await within(header).findByText("First collection"),
    ).toBeInTheDocument();
  });
});
