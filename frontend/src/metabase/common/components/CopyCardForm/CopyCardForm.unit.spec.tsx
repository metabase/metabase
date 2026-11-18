import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupGetCollectionEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { CardType, Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { CopyCardForm, type CopyCardProperties } from "./CopyCardForm";

const FOO_DASH = createMockDashboard({
  id: 1,
  collection_id: 1,
  name: "Foo Dashboard",
  tabs: [
    createMockDashboardTab({ id: 1, name: "Foo Tab 1" }),
    createMockDashboardTab({ id: 2, name: "Foo Tab 2" }),
  ],
});

const FOO_COLLECTION = createMockCollection({ id: 1, name: "Foo Collection" });

type SetupOpts = {
  initialValues?: Partial<CopyCardProperties>;
  model?: CardType;
  collections?: Collection[];
};

function setup({
  initialValues = {},
  model = "question",
  collections = [FOO_COLLECTION],
}: SetupOpts = {}) {
  const onSubmit = jest.fn((question) => Promise.resolve(question));
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  setupDashboardEndpoints(FOO_DASH);
  setupCollectionsEndpoints({
    collections,
    rootCollection: createMockCollection(ROOT_COLLECTION),
  });
  collections.forEach((collection) => setupGetCollectionEndpoint(collection));

  renderWithProviders(
    <CopyCardForm
      model={model}
      initialValues={initialValues}
      onSubmit={onSubmit}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );

  return { onSubmit, onSaved, onCancel };
}

describe("CopyQuestionForm", () => {
  it("should not allow to enter a name with more than 254 characters", async () => {
    setup();

    const nameInput = screen.getByLabelText("Name");
    const descriptionInput = screen.getByLabelText("Description");
    const saveButton = screen.getByRole("button", { name: "Duplicate" });

    await userEvent.click(nameInput);
    await userEvent.paste("A".repeat(255));
    await userEvent.click(descriptionInput);
    expect(
      await screen.findByText(/must be 254 characters or less/),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("should show validation error on mount if name is too long", async () => {
    setup({
      initialValues: { name: "A".repeat(255) },
    });

    const saveButton = screen.getByRole("button", { name: "Duplicate" });

    expect(
      await screen.findByText(/must be 254 characters or less/),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("should call onSaved with a dashboardTabId if one is selected", async () => {
    const values = {
      name: "Foo",
      collection_id: 1,
      dashboard_id: 1,
      description: null,
      dashboard_tab_id: 1,
    };
    const { onSaved } = setup({ initialValues: values });

    await userEvent.click(
      await screen.findByRole("button", { name: "Duplicate" }),
    );
    expect(onSaved).toHaveBeenCalledWith(values, {
      dashboardTabId: values.dashboard_tab_id,
    });
  });

  it("should not show the dashboard tab input for models other than question", async () => {
    setup({ model: "model" });
    expect(
      await screen.findByText(/Where do you want to save this/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Which tab should this go on/),
    ).not.toBeInTheDocument();
  });

  describe("picking where to save the copy", () => {
    const FIRST_COLLECTION_ID = 11;
    const FIRST_COLLECTION = createMockCollection({
      id: FIRST_COLLECTION_ID,
      name: "First collection",
      location: "/",
      can_write: true,
    });
    const ROOT_ITEMS = [
      createMockCollectionItem({
        id: FIRST_COLLECTION_ID,
        model: "collection",
        name: FIRST_COLLECTION.name,
        here: ["card"],
        below: ["card"],
        collection_id: null,
        can_write: true,
      }),
      createMockCollectionItem({
        id: 12,
        model: "dashboard",
        name: "Orders in a dashboard",
        collection_id: null,
        can_write: true,
      }),
    ];

    afterEach(() => {
      delete process.env.OVERSCAN;
      jest.restoreAllMocks();
    });

    function setupPicker({ model }: { model: CardType }) {
      // Renders every row of the virtualized collection picker in jsdom.
      process.env.OVERSCAN = "20";
      mockGetBoundingClientRect();
      setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
      setupDatabasesEndpoints([]);
      [FOO_COLLECTION, FIRST_COLLECTION].forEach((collection) =>
        setupCollectionItemsEndpoint({ collection, collectionItems: [] }),
      );
      // Like the backend, lists only the item types the request asks for.
      fetchMock.get("path:/api/collection/root/items", (call) => {
        const models = new URL(call.url).searchParams.getAll("models");
        const data = ROOT_ITEMS.filter((item) => models.includes(item.model));
        return { data, total: data.length, models, limit: null, offset: null };
      });
      fetchMock.get("path:/api/search", { data: [] });
      fetchMock.get("path:/api/user/recipients", { data: [] });

      return setup({
        model,
        collections: [FOO_COLLECTION, FIRST_COLLECTION],
        initialValues: { name: "Orders - Duplicate", collection_id: null },
      });
    }

    async function openPicker() {
      await userEvent.click(
        screen.getByLabelText(/Where do you want to save this/),
      );
      await waitForLoaderToBeRemoved();
      return screen.findByTestId("entity-picker-modal");
    }

    it("lets a model be copied only to a collection", async () => {
      const { onSubmit } = setupPicker({ model: "model" });

      const picker = await openPicker();
      expect(
        await within(picker).findByText("First collection"),
      ).toBeInTheDocument();
      expect(within(picker).getByText(/Select a collection$/)).toBeVisible();
      expect(
        within(picker).queryByText("Orders in a dashboard"),
      ).not.toBeInTheDocument();

      await userEvent.click(within(picker).getByText("First collection"));
      await userEvent.click(
        within(picker).getByRole("button", { name: "Select this collection" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("entity-picker-modal"),
        ).not.toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Orders - Duplicate",
          collection_id: FIRST_COLLECTION.id,
        }),
      );
    });

    it("lets a question be copied to a collection or a dashboard", async () => {
      setupPicker({ model: "question" });

      const picker = await openPicker();
      expect(
        await within(picker).findByText("Orders in a dashboard"),
      ).toBeInTheDocument();
      expect(
        within(picker).getByText(/Select a collection or dashboard$/),
      ).toBeVisible();
    });
  });
});
