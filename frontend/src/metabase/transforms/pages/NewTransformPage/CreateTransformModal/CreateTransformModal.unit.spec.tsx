import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type {
  Collection,
  CreateCollectionRequest,
  CreateTransformRequest,
  Database,
  LegacyDatasetQuery,
  Transform,
  TransformSource,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
} from "metabase-types/api/mocks";

import { CreateTransformModal } from "./CreateTransformModal";

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
const NEW_COLLECTION_ID = 41;
const NEW_TRANSFORM_ID = 51;

const POSTGRES_DB = createMockDatabase({
  id: DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  features: ["schemas"],
});

const MYSQL_DB = createMockDatabase({
  id: DB_ID,
  name: "QA MySQL8",
  engine: "mysql",
  features: [],
});

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Transforms",
  namespace: "transforms",
  can_write: true,
  effective_ancestors: [],
});

const SOURCE: TransformSource = {
  type: "query",
  // LegacyDatasetQuery is opaque; build the legacy MBQL query by hand
  query: {
    database: DB_ID,
    type: "query",
    query: { "source-table": 1 },
  } as unknown as LegacyDatasetQuery,
};

type SetupOpts = {
  database?: Database;
  schemas?: string[];
  delay?: number;
};

function setup({
  database = POSTGRES_DB,
  schemas = ["Schema A", "Schema B"],
  delay,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 40 });
  setupEnterprisePlugins();

  const collections: Collection[] = [
    createMockCollection({
      id: 40,
      name: "Existing",
      namespace: "transforms",
      location: "/",
      can_write: true,
      effective_ancestors: [],
    }),
  ];

  fetchMock.get(`path:/api/database/${database.id}`, database, { delay });
  fetchMock.get(`path:/api/database/${database.id}/syncable_schemas`, schemas, {
    delay,
  });
  fetchMock.get(/\/api\/collection\/(\d+|root)(\?.*)?$/, ({ url }) => {
    const { pathname, searchParams } = new URL(url);
    if (searchParams.get("namespace") !== "transforms") {
      return { status: 404, body: "Not found" };
    }
    const id = pathname.split("/").pop();
    if (id === "root") {
      return ROOT_COLLECTION;
    }
    return (
      collections.find((c) => String(c.id) === id) ?? {
        status: 404,
        body: "Not found",
      }
    );
  });
  fetchMock.get(/\/api\/collection\/(\d+|root)\/items/, ({ url }) => {
    const { pathname, searchParams } = new URL(url);
    const id = pathname.split("/")[3];
    const data =
      id === "root" && searchParams.get("namespace") === "transforms"
        ? collections.map((collection) => ({
            ...collection,
            model: "collection",
            here: ["collection"],
            below: [],
          }))
        : [];
    return { data, total: data.length, models: ["collection"] };
  });
  fetchMock.post("path:/api/collection", async ({ options }) => {
    const body: CreateCollectionRequest = JSON.parse(String(options.body));
    const collection = createMockCollection({
      id: NEW_COLLECTION_ID,
      name: body.name,
      namespace: "transforms",
      location: "/",
      can_write: true,
      effective_ancestors: [],
    });
    collections.push(collection);
    return collection;
  });
  fetchMock.post("path:/api/transform", async ({ options }) => {
    const body: CreateTransformRequest = JSON.parse(String(options.body));
    return createMockTransform({
      name: body.name,
      source: SOURCE,
      target: body.target,
      id: NEW_TRANSFORM_ID,
      collection_id: body.collection_id ?? null,
    });
  });
  fetchMock.post("path:/api/activity/recents", 200);

  const onCreate = jest.fn<void, [Transform]>();
  const onClose = jest.fn();

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

  renderWithProviders(
    <CreateTransformModal
      source={SOURCE}
      defaultValues={{ name: "" }}
      onCreate={onCreate}
      onClose={onClose}
    />,
    { storeInitialState: state },
  );

  return { onCreate, onClose };
}

const getSaveModal = () =>
  screen.findByRole("dialog", { name: "Save your transform" });

function getRequestBody(url: string) {
  const call = fetchMock.callHistory.lastCall(url, { method: "POST" });
  return JSON.parse(String(call?.options.body));
}

describe("CreateTransformModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a new collection from the collection picker and saves the transform into it", async () => {
    const { onCreate } = setup();
    const modal = await getSaveModal();

    const nameInput = within(modal).getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Analytics Transform");
    const tableNameInput = within(modal).getByLabelText("Table name");
    await userEvent.clear(tableNameInput);
    await userEvent.type(tableNameInput, "analytics_transform");
    await userEvent.click(
      within(modal).getByTestId("collection-picker-button"),
    );

    const picker = await screen.findByRole("dialog", {
      name: "Select a collection",
    });
    await userEvent.click(
      await within(picker).findByRole("button", { name: /New folder/ }),
    );

    const newCollectionDialog = await screen.findByRole("dialog", {
      name: "Create a new collection",
    });
    await userEvent.type(
      within(newCollectionDialog).getByLabelText("Give it a name"),
      "Analytics",
    );
    await userEvent.click(
      within(newCollectionDialog).getByRole("button", { name: "Create" }),
    );

    await waitFor(() =>
      expect(getRequestBody("path:/api/collection")).toMatchObject({
        name: "Analytics",
        namespace: "transforms",
      }),
    );
    expect(await within(picker).findByText("Analytics")).toBeInTheDocument();
    await userEvent.click(
      within(picker).getByRole("button", { name: "Select" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Select a collection" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent("Analytics"),
    );

    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(getRequestBody("path:/api/transform")).toMatchObject({
      name: "Analytics Transform",
      collection_id: NEW_COLLECTION_ID,
      target: {
        type: "table",
        name: "analytics_transform",
        schema: "Schema A",
        database: DB_ID,
      },
    });
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: NEW_TRANSFORM_ID,
        collection_id: NEW_COLLECTION_ID,
      }),
    );
  });

  it("shows the schema field when the database supports schemas", async () => {
    setup();
    const modal = await getSaveModal();

    expect(within(modal).getByLabelText("Table name")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Schema")).toBeInTheDocument();
  });

  it("does not show the schema field when the database does not support schemas", async () => {
    setup({ database: MYSQL_DB, schemas: [] });
    const modal = await getSaveModal();

    expect(within(modal).getByLabelText("Table name")).toBeInTheDocument();
    expect(within(modal).queryByLabelText("Schema")).not.toBeInTheDocument();
  });
});
