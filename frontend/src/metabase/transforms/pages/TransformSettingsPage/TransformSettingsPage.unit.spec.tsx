import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUsersEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type {
  Collection,
  Database,
  LegacyDatasetQuery,
  Transform,
  UpdateTransformRequest,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformSettingsPage } from "./TransformSettingsPage";

jest.mock(
  "metabase/transforms/components/IncrementalTransform/useHasCheckpointOptions",
  () => ({
    useHasCheckpointOptions: jest.fn().mockReturnValue({
      hasCheckpointOptions: true,
      hasNativeCheckpointOptions: true,
      transformType: "mbql",
    }),
  }),
);

const DB_ID = 2;
const TRANSFORM_ID = 7;

const POSTGRES_DB = createMockDatabase({
  id: DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  features: ["schemas"],
  transforms_permissions: "write",
});

const MYSQL_DB = createMockDatabase({
  id: DB_ID,
  name: "QA MySQL8",
  engine: "mysql",
  features: [],
  transforms_permissions: "write",
});

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Transforms",
  namespace: "transforms",
  can_write: true,
  effective_ancestors: [],
});

const OTHER_COLLECTION = createMockCollection({
  id: 30,
  name: "Other Collection",
  namespace: "transforms",
  location: "/",
  can_write: true,
  effective_ancestors: [],
});

const TARGET_COLLECTION = createMockCollection({
  id: 31,
  name: "Target Collection",
  namespace: "transforms",
  location: "/",
  can_write: true,
  effective_ancestors: [],
});

const COLLECTIONS: Collection[] = [OTHER_COLLECTION, TARGET_COLLECTION];

function createTransform(opts: Partial<Transform> = {}) {
  return createMockTransform({
    id: TRANSFORM_ID,
    name: "Movable Transform",
    collection_id: null,
    source: {
      type: "query",
      // LegacyDatasetQuery is opaque; build the legacy MBQL query by hand
      query: {
        database: DB_ID,
        type: "query",
        query: { "source-table": 1 },
      } as unknown as LegacyDatasetQuery,
    },
    target: {
      type: "table",
      database: DB_ID,
      schema: "Schema A",
      name: "transform_table",
    },
    table: null,
    ...opts,
  });
}

type SetupOpts = {
  transform?: Transform;
  database?: Database;
  schemas?: string[];
  updateStatus?: number;
  delay?: number;
};

function setupCollectionEndpoints() {
  fetchMock.get(/\/api\/collection\/(\d+|root)(\?.*)?$/, ({ url }) => {
    const { pathname, searchParams } = new URL(url);
    if (searchParams.get("namespace") !== "transforms") {
      return { status: 404, body: "Not found" };
    }
    const id = pathname.split("/").pop();
    if (id === "root") {
      return ROOT_COLLECTION;
    }
    const collection = COLLECTIONS.find((c) => String(c.id) === id);
    return collection ?? { status: 404, body: "Not found" };
  });
  fetchMock.get(/\/api\/collection\/(\d+|root)\/items/, ({ url }) => {
    const { pathname, searchParams } = new URL(url);
    const id = pathname.split("/")[3];
    const data =
      id === "root" && searchParams.get("namespace") === "transforms"
        ? COLLECTIONS.map((collection) => ({
            ...collection,
            model: "collection",
            here: ["collection"],
            below: [],
          }))
        : [];
    return { data, total: data.length, models: ["collection"] };
  });
}

function setup({
  transform = createTransform(),
  database = POSTGRES_DB,
  schemas = ["Schema A", "Schema B"],
  updateStatus = 200,
  delay,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 40 });
  setupEnterprisePlugins();
  let storedTransform = transform;

  fetchMock.get(`path:/api/transform/${transform.id}`, () => storedTransform, {
    delay,
  });
  fetchMock.put(`path:/api/transform/${transform.id}`, async ({ options }) => {
    if (updateStatus !== 200) {
      return {
        status: updateStatus,
        body: "A table with that name already exists.",
      };
    }
    const body: Partial<UpdateTransformRequest> = JSON.parse(
      String(options.body),
    );
    storedTransform = {
      ...storedTransform,
      ...(body.collection_id !== undefined && {
        collection_id: body.collection_id,
      }),
      ...(body.target !== undefined && { target: body.target }),
    };
    return storedTransform;
  });
  fetchMock.get("path:/api/database", {
    data: [database],
    total: 1,
  });
  fetchMock.get(`path:/api/database/${database.id}`, database);
  fetchMock.get(`path:/api/database/${database.id}/schemas`, schemas);
  setupCollectionEndpoints();
  setupUsersEndpoints([createMockUser({ id: 1 })]);
  fetchMock.post("path:/api/activity/recents", 200);

  const state = createMockState({
    settings: mockSettings({
      "transforms-enabled": true,
      "token-features": createMockTokenFeatures({
        "transforms-basic": true,
        "transforms-python": true,
        advanced_permissions: true,
      }),
    }),
  });

  const path = `/data-studio/transforms/${transform.id}/settings`;
  renderWithProviders(
    <Route
      path="/data-studio/transforms/:transformId/settings"
      element={<TransformSettingsPage />}
    />,
    {
      storeInitialState: state,
      withRouter: true,
      withUndos: true,
      initialRoute: path,
    },
  );
}

function getLastUpdateBody() {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/transform/${TRANSFORM_ID}`,
    { method: "PUT" },
  );
  return JSON.parse(String(call?.options.body));
}

const getBreadcrumbs = () => screen.getByTestId("data-studio-breadcrumbs");

async function openChangeTargetModal() {
  await userEvent.click(
    await screen.findByRole("button", { name: /Change target/ }),
  );
  return await screen.findByRole("dialog", {
    name: "Change the target for this transform",
  });
}

async function moveTo(collectionName: string) {
  await userEvent.click(
    within(screen.getByTestId("transforms-header")).getByRole("img", {
      name: "ellipsis icon",
    }),
  );
  await userEvent.click(
    within(screen.getByRole("menu")).getByRole("menuitem", { name: /Move/ }),
  );
  const picker = await screen.findByRole("dialog", {
    name: 'Move "Movable Transform"',
  });
  await userEvent.click(await within(picker).findByText(collectionName));
  await userEvent.click(within(picker).getByRole("button", { name: "Select" }));
}

describe("TransformSettingsPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("moving a transform", () => {
    it("moves the transform between collections and updates the breadcrumbs", async () => {
      setup();
      expect(
        await within(
          await screen.findByTestId("data-studio-breadcrumbs"),
        ).findByText("Movable Transform"),
      ).toBeInTheDocument();
      expect(
        within(getBreadcrumbs()).queryByText("Target Collection"),
      ).not.toBeInTheDocument();

      await moveTo("Target Collection");

      expect(await screen.findByText("Transform moved")).toBeInTheDocument();
      expect(getLastUpdateBody()).toEqual({
        collection_id: TARGET_COLLECTION.id,
      });
      expect(
        await within(getBreadcrumbs()).findByText("Target Collection"),
      ).toBeInTheDocument();
      expect(
        within(getBreadcrumbs()).getByText("Movable Transform"),
      ).toBeInTheDocument();

      // Dismiss the first toast so the next assertion sees a new one.
      await userEvent.click(
        within(screen.getByTestId("toast-undo")).getByRole("img", {
          name: "close icon",
        }),
      );
      await waitFor(() =>
        expect(screen.queryByText("Transform moved")).not.toBeInTheDocument(),
      );

      await moveTo("Transforms");

      expect(await screen.findByText("Transform moved")).toBeInTheDocument();
      expect(getLastUpdateBody()).toEqual({ collection_id: null });
      await waitForNoText("Target Collection");
      expect(
        within(getBreadcrumbs()).getByText("Movable Transform"),
      ).toBeInTheDocument();
    });
  });

  describe("changing the target", () => {
    it("can change the target to a new schema that does not exist yet", async () => {
      setup();
      const modal = await openChangeTargetModal();

      const nameInput = within(modal).getByLabelText("New table name");
      const schemaInput = within(modal).getByLabelText("Schema");
      expect(nameInput).toHaveValue("transform_table");
      expect(schemaInput).toHaveValue("Schema A");

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "transform_table_2");
      await userEvent.clear(schemaInput);
      await userEvent.type(schemaInput, "custom_schema");
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText(
          /Create new schema/,
        ),
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Change target" }),
      );

      expect(
        await screen.findByText("Transform target updated"),
      ).toBeInTheDocument();
      expect(getLastUpdateBody()).toEqual({
        target: {
          type: "table",
          database: DB_ID,
          schema: "custom_schema",
          name: "transform_table_2",
        },
      });

      const schemaLink = await screen.findByTestId("schema-link");
      await waitForTextContent(schemaLink, "custom_schema");
      expect(schemaLink).toHaveAttribute("aria-disabled", "true");
      const tableLink = screen.getByTestId("table-link");
      expect(tableLink).toHaveTextContent("transform_table_2");
      expect(tableLink).toHaveAttribute("aria-disabled", "true");
    });

    it("enables the schema link when the target schema already exists (control)", async () => {
      setup();
      const schemaLink = await screen.findByTestId("schema-link");
      expect(schemaLink).toHaveTextContent("Schema A");
      expect(schemaLink).toHaveAttribute("aria-disabled", "false");
      expect(screen.getByTestId("table-link")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("shows an error when a table with that name already exists", async () => {
      // The rejected mutation is logged; keep the output clean.
      jest.spyOn(console, "error").mockImplementation(() => {});
      setup({ updateStatus: 409 });
      const modal = await openChangeTargetModal();

      const nameInput = within(modal).getByLabelText("New table name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "existing_table");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Change target" }),
      );

      expect(
        await within(modal).findByText(
          "A table with that name already exists.",
        ),
      ).toBeInTheDocument();
      expect(getLastUpdateBody()).toMatchObject({
        target: { name: "existing_table", schema: "Schema A" },
      });
      expect(
        screen.queryByText("Transform target updated"),
      ).not.toBeInTheDocument();
    });

    it("does not show the schema field when the database does not support schemas", async () => {
      setup({
        database: MYSQL_DB,
        schemas: [],
        transform: createTransform({
          target: {
            type: "table",
            database: DB_ID,
            schema: null,
            name: "transform_table",
          },
        }),
      });
      const modal = await openChangeTargetModal();

      expect(
        within(modal).getByLabelText("New table name"),
      ).toBeInTheDocument();
      expect(within(modal).queryByLabelText("Schema")).not.toBeInTheDocument();
    });

    it("shows the schema field when the data arrives late (control)", async () => {
      setup({ delay: 300 });
      const modal = await openChangeTargetModal();

      expect(
        within(modal).getByLabelText("New table name"),
      ).toBeInTheDocument();
      expect(within(modal).getByLabelText("Schema")).toBeInTheDocument();
    });
  });
});

async function waitForNoText(text: string) {
  await waitFor(() =>
    expect(within(getBreadcrumbs()).queryByText(text)).not.toBeInTheDocument(),
  );
}

async function waitForTextContent(element: HTMLElement, text: string) {
  await waitFor(() => expect(element).toHaveTextContent(text));
}
