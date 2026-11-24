import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupCreateCollectionEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { CollectionNewButton } from "metabase/collections/components/CollectionHeader/CollectionNewButton";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { loadActionCreator } from "metabase/querying/action-creator";
import { setOpenModal } from "metabase/redux/ui";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import { NewModals } from "./NewModals";

async function setup() {
  // The editor is a chunk of its own, so keep its import out of the window the
  // assertions below wait in.
  await loadActionCreator();

  setupDatabasesEndpoints([createMockDatabase()]);
  setupCardsEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });

  const { store } = renderWithProviders(
    <Route path="/" element={<NewModals />} />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );

  act(() => {
    store.dispatch(setOpenModal("action"));
  });

  await screen.findByTestId("action-creator");
}

async function setupShortcut() {
  setupDatabasesEndpoints([createMockDatabase()]);
  setupCardsEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });

  renderWithProviders(<Route path="/" element={<NewModals />} />, {
    withRouter: true,
    withKBar: true,
  });

  // The shortcut is registered from an effect; a keystroke dispatched in the
  // same tick as the initial render lands before that and is lost.
  await waitFor(() =>
    expect(fetchMock.callHistory.called(/\/api\/collection/)).toBe(true),
  );
}

describe("NewModals", () => {
  it("opens the action creator in new query action mode", async () => {
    await setup();

    expect(screen.getByText(/New action/i)).toBeInTheDocument();
    expect(screen.getByTestId("mock-native-query-editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("toggles the shortcuts modal with ?", async () => {
    await setupShortcut();

    await userEvent.keyboard("{Shift>}?{/Shift}");

    const modal = await screen.findByRole("dialog", { name: "Shortcuts" });
    expect(within(modal).getByRole("tab", { name: "General" })).toBeVisible();
    expect(
      within(modal).getByRole("tab", { name: "Dashboards" }),
    ).toBeVisible();

    await userEvent.keyboard("{Shift>}?{/Shift}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Shortcuts" }),
      ).not.toBeInTheDocument();
    });
  });

  it("closes the action creator on cancel", async () => {
    await setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
    });
  });

  it("creates a new collection inside the current collection from its header button when the user cannot curate the root", async () => {
    const personalCollection = createMockCollection({
      id: 5,
      name: "Read Only Tableton's Personal Collection",
      personal_owner_id: 1,
      can_write: true,
    });
    // The fallback for a user who cannot curate the root. Pointing the user's
    // personal collection id here proves the modal picks the current collection.
    const otherCollection = createMockCollection({
      id: 7,
      name: "Fallback collection",
      can_write: true,
    });
    const createdCollection = createMockCollection({
      id: 6,
      name: "sub",
      location: "/5/",
      parent_id: 5,
    });
    const rootCollection = createMockCollection({
      ...ROOT_COLLECTION,
      can_write: false,
    });
    setupDatabasesEndpoints([createMockDatabase()]);
    setupCollectionsEndpoints({
      collections: [otherCollection, personalCollection],
      rootCollection,
    });
    setupCollectionByIdEndpoint({
      collections: [rootCollection, otherCollection, personalCollection],
    });
    setupCreateCollectionEndpoint(createdCollection);

    const { router } = renderWithProviders(
      <Route
        path="/collection/:slug"
        element={
          <>
            <CollectionNewButton />
            <NewModals />
          </>
        }
      />,
      {
        withRouter: true,
        initialRoute: `/collection/${personalCollection.id}`,
        storeInitialState: createMockState({
          currentUser: createMockUser({
            id: 1,
            personal_collection_id: Number(otherCollection.id),
          }),
        }),
      },
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Create a new collection" }),
    );
    const modal = await screen.findByTestId("new-collection-modal");
    await waitFor(() => {
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent(personalCollection.name);
    });
    await userEvent.type(within(modal).getByLabelText("Name"), "sub");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Create" }),
    );

    await waitFor(() => {
      expect(router?.location.pathname).toBe("/collection/6-sub");
    });
    const createCalls = fetchMock.callHistory.calls("create-collection");
    expect(createCalls).toHaveLength(1);
    expect(JSON.parse(String(createCalls[0].options.body))).toMatchObject({
      name: "sub",
      parent_id: personalCollection.id,
    });
  });
});
