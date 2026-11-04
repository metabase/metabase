import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupAdhocQueryMetadataEndpoint,
  setupBookmarksEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
  setupUpdateSettingEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { NewItemMenu } from "metabase/nav/components/NewItemMenu";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Database, DatabaseId } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockDatabase,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QueryBuilder } from "./QueryBuilder";

// The global mock of NativeQueryEditor does not report database changes to the query builder.
jest.unmock("metabase/querying/components/NativeQueryEditor");

const SAMPLE_DB = createSampleDatabase();
const POSTGRES_DB = createMockDatabase({
  id: 2,
  name: "QA Postgres12",
  engine: "postgres",
});
const ADDITIONAL_DB = createMockDatabase({
  id: 3,
  name: "New Database",
  engine: "postgres",
});

const LAST_USED_DATABASE_SETTING_URL =
  "/api/setting/last-used-native-database-id";

type EditorType = "question" | "model";

interface SetupOpts {
  editorType: EditorType;
  databases?: Database[];
  lastUsedDatabaseId?: DatabaseId | null;
}

const setup = async ({
  editorType,
  databases = [SAMPLE_DB, POSTGRES_DB],
  lastUsedDatabaseId = null,
}: SetupOpts) => {
  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints(databases);
  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata({ databases }));
  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();
  setupSearchEndpoints([]);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(
    <Route>
      <Route
        path="/"
        element={<NewItemMenu trigger={<button>New</button>} />}
      />
      <Route path="/model/query" element={<QueryBuilder />} />
      <Route path="/question" element={<QueryBuilder />} />
    </Route>,
    {
      withRouter: true,
      initialRoute:
        editorType === "model" ? getNewNativeModelUrl(lastUsedDatabaseId) : "/",
      storeInitialState: createMockState({
        currentUser: createMockUser({
          permissions: createMockUserPermissions({
            can_create_queries: true,
            can_create_native_queries: true,
          }),
        }),
        settings: mockSettings({
          "last-used-native-database-id": lastUsedDatabaseId,
        }),
      }),
    },
  );

  if (editorType === "question") {
    await userEvent.click(await screen.findByText("New"));
    await userEvent.click(await screen.findByText("SQL query"));
  }

  await screen.findByTestId("native-query-top-bar");
  await act(() => fetchMock.callHistory.flush(true));
};

// The "Use a native query" link of NewModelOptions, which its own spec pins.
const getNewNativeModelUrl = (databaseId: DatabaseId | null) =>
  Urls.newQuestion({
    mode: "query",
    DEPRECATED_RAW_MBQL_type: "native",
    creationType: "native_question",
    cardType: "model",
    DEPRECATED_RAW_MBQL_databaseId: databaseId ?? undefined,
  });

const selectDatabase = async (name: string) => {
  await userEvent.click(
    await within(await screen.findByRole("dialog")).findByText(name),
  );
  await waitFor(() =>
    expect(screen.getByTestId("selected-database")).toHaveTextContent(name),
  );
};

const findLastUsedDatabaseRequests = async () => {
  const requests = await findRequests("PUT");
  return requests.filter(({ url }) =>
    url.endsWith(LAST_USED_DATABASE_SETTING_URL),
  );
};

describe("QueryBuilder > native database source", () => {
  describe.each<EditorType>(["question", "model"])(
    "native %s",
    (editorType) => {
      it("asks for a database when no database was used before", async () => {
        await setup({ editorType, lastUsedDatabaseId: null });

        expect(screen.getByTestId("native-query-top-bar")).toHaveTextContent(
          "Select a database",
        );
        expect(
          screen.queryByTestId("selected-database"),
        ).not.toBeInTheDocument();
      });

      it("persists the selected database as the last used one", async () => {
        await setup({ editorType, lastUsedDatabaseId: null });

        await selectDatabase(POSTGRES_DB.name);

        await waitFor(async () => {
          expect(await findLastUsedDatabaseRequests()).toHaveLength(1);
        });
        const [request] = await findLastUsedDatabaseRequests();
        expect(request.body).toEqual({ value: POSTGRES_DB.id });
      });

      it("preselects the last used database", async () => {
        await setup({ editorType, lastUsedDatabaseId: POSTGRES_DB.id });

        expect(
          await screen.findByTestId("selected-database"),
        ).toHaveTextContent(POSTGRES_DB.name);
        expect(
          screen.getByTestId("native-query-top-bar"),
        ).not.toHaveTextContent("Select a database");
      });

      it("persists the database only when a different database is selected", async () => {
        await setup({ editorType, lastUsedDatabaseId: SAMPLE_DB.id });

        await userEvent.click(await screen.findByTestId("selected-database"));
        await selectDatabase(SAMPLE_DB.name);
        expect(await findLastUsedDatabaseRequests()).toHaveLength(0);

        await userEvent.click(screen.getByTestId("selected-database"));
        await selectDatabase(POSTGRES_DB.name);
        await waitFor(async () => {
          expect(await findLastUsedDatabaseRequests()).toHaveLength(1);
        });
        const [request] = await findLastUsedDatabaseRequests();
        expect(request.body).toEqual({ value: POSTGRES_DB.id });
      });
    },
  );

  describe("databases without native write permissions (metabase#39053)", () => {
    it("selects and persists the only database the user can query natively", async () => {
      await setup({
        editorType: "question",
        databases: [
          createSampleDatabase({ native_permissions: "none" }),
          POSTGRES_DB,
        ],
        lastUsedDatabaseId: null,
      });

      expect(await screen.findByTestId("selected-database")).toHaveTextContent(
        POSTGRES_DB.name,
      );
      await waitFor(async () => {
        expect(await findLastUsedDatabaseRequests()).toHaveLength(1);
      });
      const [request] = await findLastUsedDatabaseRequests();
      expect(request.body).toEqual({ value: POSTGRES_DB.id });

      await userEvent.click(screen.getByTestId("selected-database"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("lists only the databases the user can query natively", async () => {
      await setup({
        editorType: "question",
        databases: [
          createSampleDatabase({ native_permissions: "none" }),
          POSTGRES_DB,
          ADDITIONAL_DB,
        ],
        lastUsedDatabaseId: POSTGRES_DB.id,
      });

      await userEvent.click(await screen.findByTestId("selected-database"));

      const popover = await screen.findByRole("dialog");
      expect(within(popover).getByText(POSTGRES_DB.name)).toBeInTheDocument();
      expect(within(popover).getByText(ADDITIONAL_DB.name)).toBeInTheDocument();
      expect(
        within(popover).queryByText(SAMPLE_DB.name),
      ).not.toBeInTheDocument();
    });
  });
});
