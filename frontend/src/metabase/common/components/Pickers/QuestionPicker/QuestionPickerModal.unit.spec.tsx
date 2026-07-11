import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
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
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { QuestionPickerModal } from "./QuestionPickerModal";

// A card the current user can view but not edit (can_write: false). Selecting
// such items in the question picker must be allowed (metabase#50602).
const READ_ONLY_QUESTION = createMockCollectionItem({
  id: 100,
  model: "card",
  name: "Read-Only Question",
  collection_id: null,
  can_write: false,
});

async function setup() {
  mockGetBoundingClientRect();

  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection(ROOT_COLLECTION),
  });
  setupCollectionByIdEndpoint({ collections: [] });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [READ_ONLY_QUESTION],
  });
  fetchMock.get("path:/api/search", { data: [], total: 0 });
  fetchMock.get("path:/api/ee/library", { message: "not found" });
  fetchMock.get("path:/api/user/recipients", { data: [] });

  const onChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <QuestionPickerModal
      onChange={onChange}
      onClose={onClose}
      options={{ hasRecents: false, hasDatabases: false }}
    />,
  );

  await waitForLoaderToBeRemoved();

  return { onChange, onClose };
}

describe("QuestionPickerModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("allows selecting a question in a collection the user can only read (metabase#50602)", async () => {
    const { onChange } = await setup();

    await userEvent.click(await screen.findByText("Read-Only Question"));

    const selectButton = await screen.findByRole("button", { name: "Select" });
    expect(selectButton).toBeEnabled();

    await userEvent.click(selectButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 100,
          model: "card",
          name: "Read-Only Question",
        }),
      );
    });
  });
});
