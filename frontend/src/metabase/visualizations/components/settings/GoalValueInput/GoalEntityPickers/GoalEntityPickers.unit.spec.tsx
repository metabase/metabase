import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { GoalEntityPickers } from "./GoalEntityPickers";

const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "Personal",
  personal_owner_id: 1,
});

const QUESTION = createMockCollectionItem({
  id: 1,
  model: "card",
  name: "Orders question",
  collection_id: null,
});

const MODEL = createMockCollectionItem({
  id: 2,
  model: "dataset",
  name: "Orders model",
  collection_id: null,
});

const METRIC = createMockCollectionItem({
  id: 3,
  model: "metric",
  name: "Revenue metric",
  collection_id: null,
});

function setup() {
  mockGetBoundingClientRect();
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([]);
  fetchMock.get("path:/api/ee/library", { message: "not found" });
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection(ROOT_COLLECTION),
  });
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [QUESTION, MODEL, METRIC],
  });

  const onChange = jest.fn();

  renderWithProviders(
    <GoalEntityPickers
      hasOpened
      opened
      onBack={jest.fn()}
      onChange={onChange}
      onClose={jest.fn()}
    />,
  );

  return { onChange };
}

describe("GoalEntityPickers", () => {
  it("titles the browse-all modal after the sources it offers", async () => {
    setup();

    const modal = await openBrowseAll();

    expect(
      await within(modal).findByText(
        "Pick a measure, metric, or saved question",
      ),
    ).toBeInTheDocument();
  });

  it("lists questions and metrics, but not models, when browsing all", async () => {
    setup();

    const modal = await openBrowseAll();

    expect(await within(modal).findByText(QUESTION.name)).toBeInTheDocument();
    expect(within(modal).getByText(METRIC.name)).toBeInTheDocument();
    expect(within(modal).queryByText(MODEL.name)).not.toBeInTheDocument();
  });

  it("picks a question from the browse-all modal and closes it", async () => {
    const { onChange } = setup();

    const modal = await openBrowseAll();
    await userEvent.click(await within(modal).findByText(QUESTION.name));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: QUESTION.id, model: "card" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("entity-picker-modal"),
      ).not.toBeInTheDocument(),
    );
  });
});

async function openBrowseAll() {
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Browse all/ }),
  );
  const modal = await screen.findByTestId("entity-picker-modal");
  await userEvent.click(
    await within(modal).findByRole("link", { name: /Our analytics/ }),
  );

  return modal;
}
