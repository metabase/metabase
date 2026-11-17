import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupSearchEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { loadActionCreator } from "metabase/querying/action-creator";
import { setOpenModal } from "metabase/redux/ui";
import { Route } from "metabase/router";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NewModals } from "./NewModals";

// The global mock of NativeQueryEditor does not render the real database selector.
jest.unmock("metabase/querying/components/NativeQueryEditor");

const SAMPLE_DB = createSampleDatabase({
  settings: { "database-enable-actions": true },
});
const POSTGRES_DB = createMockDatabase({
  id: 2,
  name: "QA Postgres12",
  engine: "postgres",
  settings: { "database-enable-actions": true },
});

async function setup() {
  await loadActionCreator();

  setupDatabasesEndpoints([SAMPLE_DB, POSTGRES_DB]);
  setupCardsEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();
  setupSearchEndpoints([]);
  setupUpdateSettingEndpoint();

  const { store } = renderWithProviders(
    <Route path="/" element={<NewModals />} />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "last-used-native-database-id": POSTGRES_DB.id,
        }),
      }),
    },
  );

  act(() => {
    store.dispatch(setOpenModal("action"));
  });

  await screen.findByTestId("native-query-top-bar");
  await act(() => fetchMock.callHistory.flush(true));
}

describe("NewModals > action > native database source", () => {
  it("does not preselect the last used native database", async () => {
    await setup();

    expect(screen.getByTestId("native-query-top-bar")).toHaveTextContent(
      "Select a database",
    );
    expect(screen.queryByTestId("selected-database")).not.toBeInTheDocument();
  });

  it("does not persist the selected database as the last used one", async () => {
    await setup();

    await userEvent.click(await screen.findByText(SAMPLE_DB.name));
    await waitFor(() =>
      expect(screen.getByTestId("selected-database")).toHaveTextContent(
        SAMPLE_DB.name,
      ),
    );

    const requests = await findRequests("PUT");
    expect(
      requests.filter(({ url }) =>
        url.endsWith("/api/setting/last-used-native-database-id"),
      ),
    ).toHaveLength(0);
  });
});
