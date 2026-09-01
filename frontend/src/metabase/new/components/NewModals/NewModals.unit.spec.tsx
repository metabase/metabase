import userEvent from "@testing-library/user-event";

import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { loadActionCreator } from "metabase/querying/action-creator";
import { setOpenModal } from "metabase/redux/ui";
import { Route } from "metabase/router";
import { createMockDatabase } from "metabase-types/api/mocks";

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
    { withRouter: true },
  );

  act(() => {
    store.dispatch(setOpenModal("action"));
  });

  await screen.findByTestId("action-creator");
}

describe("NewModals", () => {
  it("opens the action creator in new query action mode", async () => {
    await setup();

    expect(screen.getByText(/New action/i)).toBeInTheDocument();
    expect(screen.getByTestId("mock-native-query-editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("closes the action creator on cancel", async () => {
    await setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
    });
  });
});
