import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionTreeEndpoint,
  setupDatabaseListEndpoint,
  setupGetTransformEndpoint,
  setupLibraryEndpoints,
  setupListTransformTagsEndpoint,
  setupListTransformsEndpoint,
  setupNativeQuerySnippetEndpoints,
  setupTableQueryMetadataEndpoint,
  setupUserMetabotPermissionsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupCustomVizPluginListEndpoint } from "__support__/server-mocks/custom-viz-plugin";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  mockGetBoundingClientRect,
  renderRoutes,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route, toRouteObjects } from "metabase/router";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Database, Transform } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformTag,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getDataStudioTransformRoutes } from "./routes";

// A SQL transform shows "Edit definition" in the native editor's top bar, which
// the shared native editor mock does not render.
jest.unmock("metabase/querying/components/NativeQueryEditor");

// The e2e tests ran with a pro-self-hosted token, which has every feature
const ALL_TOKEN_FEATURES = Object.fromEntries(
  Object.keys(createMockTokenFeatures()).map((feature) => [feature, true]),
);

const TRANSFORM_ID = 7;
const TARGET_SCHEMA = "Schema A";

const TRANSFORM: Transform = createMockTransform({
  id: TRANSFORM_ID,
  name: "Read-only transform",
  source: {
    type: "query",
    query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "SELECT * FROM {{ table }}",
      templateTags: {
        table: { type: "table", "table-id": ORDERS_ID },
      },
    }),
  },
  target: {
    type: "table",
    name: "transform_table",
    schema: TARGET_SCHEMA,
    database: SAMPLE_DB_ID,
  },
});

type SetupOpts = {
  initialRoute: string;
  // remote sync is set up in read-only mode, or else in read-write mode
  isRemoteSyncReadOnly: boolean;
  isRemoteSyncEnabled?: boolean;
  extraDatabases?: Database[];
};

function setup({
  initialRoute,
  isRemoteSyncReadOnly,
  isRemoteSyncEnabled = true,
  extraDatabases = [],
}: SetupOpts) {
  // The transform list is virtualized and renders no rows without a size
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const database = createSampleDatabase({ transforms_permissions: "write" });
  setupDatabaseListEndpoint([database, ...extraDatabases]);
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [database, ...extraDatabases] }),
  );
  extraDatabases.forEach((db) =>
    fetchMock.get(`path:/api/database/${db.id}`, db),
  );
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  fetchMock.get(`path:/api/database/${SAMPLE_DB_ID}`, database);
  fetchMock.get(`path:/api/database/${SAMPLE_DB_ID}/schemas`, [TARGET_SCHEMA]);
  setupCollectionTreeEndpoint([]);
  setupTableQueryMetadataEndpoint(createOrdersTable());
  setupNativeQuerySnippetEndpoints();
  fetchMock.get(
    { url: "path:/api/collection", query: { namespace: "snippets" } },
    [],
  );
  setupLibraryEndpoints();
  setupCustomVizPluginListEndpoint([]);
  setupListTransformsEndpoint([TRANSFORM]);
  setupGetTransformEndpoint(TRANSFORM);
  setupListTransformTagsEndpoint([createMockTransformTag({ name: "daily" })]);
  setupUserMetabotPermissionsEndpoint();
  setupUsersEndpoints([]);
  fetchMock.get("path:/api/ee/transforms-python/library/common.py", {
    path: "common.py",
    source: "def shared():\n    return 42\n",
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(ALL_TOKEN_FEATURES),
    "transforms-enabled": true,
    "remote-sync-enabled": isRemoteSyncEnabled,
    "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : "read-write",
  });
  setupEnterprisePlugins();

  return renderRoutes(
    toRouteObjects(
      <Route path="data-studio/transforms">
        {getDataStudioTransformRoutes()}
      </Route>,
    ),
    {
      initialRoute,
      storeInitialState: createMockState({
        // the native editor reads the databases it can pick from the metadata
        entities: createMockEntitiesState({
          databases: [database, ...extraDatabases],
        }),
        settings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("transform pages with read-only remote sync", () => {
  it("disables creating transforms on the list page", async () => {
    setup({
      initialRoute: "/data-studio/transforms",
      isRemoteSyncReadOnly: true,
    });

    const button = await screen.findByRole("button", {
      name: "Create a transform",
    });
    expect(button).toBeDisabled();
    await userEvent.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Transforms can't be created when Remote Sync is in read-only mode",
    );
  });

  it("enables creating transforms without read-only remote sync", async () => {
    setup({
      initialRoute: "/data-studio/transforms",
      isRemoteSyncReadOnly: false,
    });

    expect(
      await screen.findByRole("button", { name: "Create a transform" }),
    ).toBeEnabled();
  });

  it("enables creating transforms when remote sync is turned off", async () => {
    setup({
      initialRoute: "/data-studio/transforms",
      isRemoteSyncReadOnly: true,
      isRemoteSyncEnabled: false,
    });

    expect(
      await screen.findByRole("button", { name: "Create a transform" }),
    ).toBeEnabled();
  });

  it("opens a read-only Python library editor from the list page", async () => {
    const { router } = setup({
      initialRoute: "/data-studio/transforms",
      isRemoteSyncReadOnly: true,
    });

    await userEvent.click(await screen.findByText("Python library"));

    await waitFor(() =>
      expect(router.location.pathname).toBe(
        "/data-studio/transforms/library/common.py",
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /The Python library is not editable/,
    );
    // CodeMirror is mocked with a textarea in unit tests: `editable={false}`
    // renders it disabled, and `readOnly` is passed through.
    const editor = await screen.findByTestId("python-editor");
    expect(editor).toBeDisabled();
    expect(editor).toHaveAttribute("readonly");
  });

  it("opens an editable Python library editor without read-only remote sync", async () => {
    setup({
      initialRoute: "/data-studio/transforms/library/common.py",
      isRemoteSyncReadOnly: false,
    });

    const editor = await screen.findByTestId("python-editor");
    expect(editor).toBeEnabled();
    expect(editor).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hides the edit definition button on the transform page", async () => {
    setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: true,
    });

    // the definition and its top bar are rendered, so the button would be
    // there by now
    expect(
      await screen.findByDisplayValue("SELECT * FROM {{ table }}"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("native-query-top-bar"),
    ).toBeInTheDocument();
    expect(
      within(getHeader()).getByRole("tab", { name: "Run" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("edit-definition-button"),
    ).not.toBeInTheDocument();
  });

  it("shows the edit definition button without read-only remote sync", async () => {
    setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: false,
    });

    expect(
      await screen.findByTestId("edit-definition-button"),
    ).toHaveTextContent("Edit definition");
  });

  it("disables the schedule tags on the Run tab", async () => {
    const { router } = setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: true,
    });

    await openTab("Run");

    expect(router.location.pathname).toBe(
      `/data-studio/transforms/${TRANSFORM_ID}/run`,
    );
    expect(await screen.findByLabelText("Tags")).toBeDisabled();
  });

  it("enables the schedule tags without read-only remote sync", async () => {
    setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: false,
    });

    await openTab("Run");

    expect(await screen.findByLabelText("Tags")).toBeEnabled();
  });

  it("locks the target and incremental settings on the Settings tab", async () => {
    const { router } = setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: true,
    });

    await openTab("Settings");

    expect(router.location.pathname).toBe(
      `/data-studio/transforms/${TRANSFORM_ID}/settings`,
    );
    expect(await screen.findByTestId("schema-link")).toHaveTextContent(
      TARGET_SCHEMA,
    );
    expect(
      await screen.findByRole("switch", { name: /Only process new data/ }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Change target/ }),
    ).not.toBeInTheDocument();
  });

  it("unlocks the target and incremental settings without read-only remote sync", async () => {
    setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: false,
    });

    await openTab("Settings");

    expect(await screen.findByTestId("schema-link")).toHaveTextContent(
      TARGET_SCHEMA,
    );
    expect(
      await screen.findByRole("switch", { name: /Only process new data/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Change target/ }),
    ).toBeInTheDocument();
  });

  it("redirects the edit url to the view-only transform page and hides move and delete", async () => {
    const { router } = setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}/edit`,
      isRemoteSyncReadOnly: true,
    });

    await waitFor(() =>
      expect(router.location.pathname).toBe(
        `/data-studio/transforms/${TRANSFORM_ID}`,
      ),
    );

    await userEvent.click(
      await within(await findHeader()).findByRole("button", {
        name: "Transform options",
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /History/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /Move/ }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the edit url and offers move and delete without read-only remote sync", async () => {
    const { router } = setup({
      initialRoute: `/data-studio/transforms/${TRANSFORM_ID}`,
      isRemoteSyncReadOnly: false,
    });

    await userEvent.click(
      await within(await findHeader()).findByRole("button", {
        name: "Transform options",
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /Move/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /Delete/ }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    act(() => {
      router.navigate(`/data-studio/transforms/${TRANSFORM_ID}/edit`);
    });
    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
    expect(router.location.pathname).toBe(
      `/data-studio/transforms/${TRANSFORM_ID}/edit`,
    );
  });

  it.each(["native", "python", "query"])(
    "shows a not found page for a new %s transform",
    async (type) => {
      setup({
        initialRoute: `/data-studio/transforms/new/${type}`,
        isRemoteSyncReadOnly: true,
      });

      const editor = await screen.findByTestId("transform-query-editor");
      expect(
        await within(editor).findByText("We're a little lost..."),
      ).toBeInTheDocument();
    },
  );

  it.each(["native", "python", "query"])(
    "shows the editor for a new %s transform without read-only remote sync",
    async (type) => {
      setup({
        initialRoute: `/data-studio/transforms/new/${type}`,
        isRemoteSyncReadOnly: false,
      });

      const editor = await screen.findByTestId("transform-query-editor");
      expect(
        await within(editor).findByPlaceholderText("New transform"),
      ).toBeInTheDocument();
      expect(
        within(editor).queryByText("We're a little lost..."),
      ).not.toBeInTheDocument();
    },
  );
});

function getHeader() {
  return screen.getByTestId("transforms-header");
}

function findHeader() {
  return screen.findByTestId("transforms-header");
}

async function openTab(name: string) {
  await userEvent.click(
    await within(await findHeader()).findByRole("tab", { name }),
  );
}

// Only a database with "transforms/table" can be picked as a transform source
const WRITABLE_DB = createMockDatabase({
  id: 2,
  name: "Writable Postgres12",
  engine: "postgres",
  features: [...COMMON_DATABASE_FEATURES, "transforms/table"],
  transforms_permissions: "write",
});

describe("new transform page (GDGT-2429)", () => {
  it("warns about unsaved changes while the save modal is open, and not after saving", async () => {
    const createdTransform = createMockTransform({
      id: 9,
      name: "GDGT-2429 transform",
      source: TRANSFORM.source,
      target: TRANSFORM.target,
    });
    fetchMock.post("path:/api/transform", () => {
      setupGetTransformEndpoint(createdTransform);
      return createdTransform;
    });
    fetchMock.get(`path:/api/database/${WRITABLE_DB.id}/syncable_schemas`, [
      "public",
      TARGET_SCHEMA,
    ]);

    const { router } = setup({
      initialRoute: "/data-studio/transforms",
      isRemoteSyncReadOnly: false,
      extraDatabases: [WRITABLE_DB],
    });
    await screen.findByRole("button", { name: "Create a transform" });
    act(() => {
      router.navigate("/data-studio/transforms/new/native");
    });

    const editor = await screen.findByTestId("transform-query-editor");
    const picker = await screen.findByRole("dialog");
    await userEvent.click(
      await within(picker).findByText("Writable Postgres12"),
    );
    await userEvent.click(within(editor).getByTestId("native-query-editor"));
    await userEvent.paste("SELECT 42");
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));
    const saveModal = await screen.findByRole("dialog", {
      name: "Save your transform",
    });

    act(() => {
      router.back();
    });
    const leaveModal = await screen.findByTestId("leave-confirmation");
    expect(
      within(leaveModal).getByText("Discard your changes?"),
    ).toBeInTheDocument();

    // Escape is handled by the modal holding the focus, so wait for the focus
    // trap to move into the warning, as the user would see it
    await waitFor(() =>
      expect(
        within(leaveModal).getByRole("button", { name: "Discard changes" }),
      ).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument(),
    );
    expect(saveModal).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Save your transform" }),
    ).toBeInTheDocument();
    expect(router.location.pathname).toBe("/data-studio/transforms/new/native");

    const nameInput = within(saveModal).getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "GDGT-2429 transform");
    await userEvent.click(
      within(saveModal).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(router.location.pathname).toBe("/data-studio/transforms/9"),
    );
    const [createCall] = fetchMock.callHistory.calls("path:/api/transform", {
      method: "POST",
    });
    expect(JSON.parse(String(createCall.options.body))).toMatchObject({
      name: "GDGT-2429 transform",
      source: {
        type: "query",
        query: { database: WRITABLE_DB.id },
      },
    });
    expect(
      await within(await findHeader()).findByDisplayValue(
        "GDGT-2429 transform",
      ),
    ).toBeInTheDocument();

    act(() => {
      router.back();
    });
    await waitFor(() =>
      expect(router.location.pathname).toBe(
        "/data-studio/transforms/new/native",
      ),
    );
    expect(screen.queryByTestId("leave-confirmation")).not.toBeInTheDocument();
  });
});
