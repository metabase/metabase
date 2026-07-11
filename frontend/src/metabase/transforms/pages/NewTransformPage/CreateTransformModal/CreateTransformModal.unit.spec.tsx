import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen } from "__support__/ui";
import { createMockCollection, createMockDatabase } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { CreateTransformModal } from "./CreateTransformModal";

const DB_ID = 10;

// Schemas that have synced tables (returned by /schemas)
const NON_EMPTY_SCHEMAS = ["public"];
// All syncable schemas, including empty ones with no tables (returned by /syncable_schemas)
const SYNCABLE_SCHEMAS = ["empty_schema", "public"];

function setup() {
  const database = createMockDatabase({
    id: DB_ID,
    features: ["schemas", "nested-queries"],
  });

  fetchMock.get(`path:/api/database/${DB_ID}`, database);
  fetchMock.get(`path:/api/database/${DB_ID}/schemas`, NON_EMPTY_SCHEMAS);
  fetchMock.get(
    `path:/api/database/${DB_ID}/syncable_schemas`,
    SYNCABLE_SCHEMAS,
  );
  // Peripheral endpoints touched while the modal mounts (collection picker, query metadata).
  fetchMock.get("path:/api/database", { data: [database], total: 1 });
  fetchMock.get("path:/api/collection/root", createMockCollection({ id: "root" }));
  fetchMock.post("path:/api/dataset/query_metadata", {});

  const source = {
    type: "query" as const,
    query: createMockStructuredDatasetQuery({ database: DB_ID }),
  };

  renderWithProviders(
    <CreateTransformModal
      source={source}
      defaultValues={{}}
      onClose={jest.fn()}
      showIncrementalSettings={false}
    />,
  );
}

describe("CreateTransformModal (metabase#68378)", () => {
  it("should offer empty schemas as a target schema", async () => {
    setup();

    // Wait for the schema select to appear (schemas finished loading)
    const schemaInput = await screen.findByLabelText("Schema");
    act(() => schemaInput.focus());

    // The empty schema (no tables) must be offered as a target option.
    expect(await screen.findByText("empty_schema")).toBeInTheDocument();
  });
});
