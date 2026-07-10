import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableIndexEndpoints } from "__support__/server-mocks/index-manager";
import { setupTableQueryMetadataEndpoint } from "__support__/server-mocks/table";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  RequestableIndexes,
  StructuredIndex,
  Table,
  TableIndexEntry,
} from "metabase-types/api";
import {
  createMockField,
  createMockRequestableIndexes,
  createMockTable,
  createMockTableIndexEntry,
  createMockTableIndexRequest,
  createMockTransform,
} from "metabase-types/api/mocks";

import { IndexEditorModal } from "./IndexEditorModal";

const TABLE = createMockTable({
  id: 10,
  fields: [
    createMockField({ id: 1, name: "city", display_name: "City name" }),
    createMockField({ id: 2, name: "country", display_name: "Country" }),
  ],
});

function setup({
  index,
  table = TABLE,
  requestableIndexes = createMockRequestableIndexes(),
}: {
  index?: TableIndexEntry;
  table?: Table | null;
  requestableIndexes?: RequestableIndexes;
} = {}) {
  const transform = createMockTransform({
    id: 1,
    table,
    requestable_indexes: requestableIndexes,
  });

  setupTableQueryMetadataEndpoint(TABLE);
  setupTableIndexEndpoints(
    transform.id,
    index?.request != null ? [index.request] : [],
  );

  const onClose = jest.fn();
  renderWithProviders(
    <IndexEditorModal transform={transform} index={index} onClose={onClose} />,
    { withUndos: true },
  );

  return { onClose };
}

describe("IndexEditorModal", () => {
  it("creates a btree index with directions and unique", async () => {
    setup();

    expect(
      await screen.findByText(
        "The data structure used to organize the index. B-tree works well for most lookups, sorting, and range queries.",
      ),
    ).toBeInTheDocument();

    await userEvent.type(
      await screen.findByLabelText("Give your index a name"),
      "index 1",
    );

    await userEvent.click(screen.getByPlaceholderText("Select columns"));
    await userEvent.click(
      await screen.findByRole("option", { name: "City name" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Country" }),
    );

    await userEvent.click(screen.getByRole("switch"));

    await userEvent.click(screen.getByRole("button", { name: "Create index" }));

    const body = await waitForBody("createTableIndex");

    expect(body.transform_id).toBe(1);
    expect(body.structured).toEqual({
      kind: "btree",
      name: "index 1",
      columns: [
        { name: "city", direction: "asc" },
        { name: "country", direction: "asc" },
      ],
      unique: true,
    });
  });

  it("does not offer directions or a unique switch for gin", async () => {
    setup();

    await userEvent.click(await screen.findByLabelText("Index type"));
    await userEvent.click(await screen.findByRole("option", { name: /GIN/ }));

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    await userEvent.type(
      await screen.findByLabelText("Give your index a name"),
      "idx_search",
    );
    await userEvent.click(screen.getByPlaceholderText("Select columns"));
    await userEvent.click(
      await screen.findByRole("option", { name: "City name" }),
    );

    expect(
      screen.queryByText("Sort order for each column to be stored in"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create index" }));

    const body = await waitForBody("createTableIndex");
    expect(body.structured).toEqual({
      kind: "gin",
      name: "idx_search",
      columns: [{ name: "city" }],
    });
  });

  it("retains the name and selected columns when changing the index type", async () => {
    setup();

    await userEvent.type(
      await screen.findByLabelText("Give your index a name"),
      "shared_idx",
    );

    await userEvent.click(screen.getByPlaceholderText("Select columns"));
    await userEvent.click(
      await screen.findByRole("option", { name: "City name" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Country" }),
    );

    await userEvent.click(screen.getByLabelText("Index type"));
    await userEvent.click(await screen.findByRole("option", { name: /GIN/ }));

    expect(screen.getByLabelText("Give your index a name")).toHaveValue(
      "shared_idx",
    );
    expect(screen.getByText("City name")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create index" }));

    const body = await waitForBody("createTableIndex");
    expect(body.structured).toEqual({
      kind: "gin",
      name: "shared_idx",
      columns: [{ name: "city" }, { name: "country" }],
    });
  });

  it("blocks submitting without a required name", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Create index" }),
    );

    expect((await screen.findAllByText("required")).length).toBeGreaterThan(0);
    expect(fetchMock.callHistory.called("createTableIndex")).toBe(false);
  });

  it("edits an existing index and only sends structured via PUT", async () => {
    const structured: StructuredIndex = {
      kind: "btree",
      name: "idx_existing",
      columns: [{ name: "city", direction: "asc" }],
      unique: false,
    };
    const index = createMockTableIndexEntry({
      metabase_managed: true,
      request: createMockTableIndexRequest({ id: 42, structured }),
    });

    setup({ index });

    const nameInput = await screen.findByLabelText("Give your index a name");
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue("idx_existing");
    expect(screen.getByLabelText("Index type")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Update index" }));

    const body = await waitForBody("updateTableIndex-42");
    expect(Object.keys(body)).toEqual(["structured"]);
    expect(body.structured.name).toBe("idx_existing");
  });

  it("shows an error toast when the request fails", async () => {
    setup();
    fetchMock.modifyRoute("createTableIndex", {
      response: { status: 400, body: {} },
    });

    await userEvent.type(
      await screen.findByLabelText("Give your index a name"),
      "idx",
    );
    await userEvent.click(screen.getByPlaceholderText("Select columns"));
    await userEvent.click(
      await screen.findByRole("option", { name: "City name" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Create index" }));

    expect(await screen.findByText("Failed to save index")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Failed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Success" }),
    ).not.toBeInTheDocument();
  });

  it("shows a message instead of a form when the transform has no target table", async () => {
    const index = createMockTableIndexEntry({
      request: createMockTableIndexRequest({
        structured: { kind: "btree", name: "idx", columns: [{ name: "city" }] },
      }),
    });

    setup({ index, table: null });

    expect(
      await screen.findByText("Run the transform before editing its indexes."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Give your index a name"),
    ).not.toBeInTheDocument();
  });

  it("shows a message when the index kind is no longer requestable", async () => {
    const index = createMockTableIndexEntry({
      request: createMockTableIndexRequest({
        structured: { kind: "btree", name: "idx", columns: [{ name: "city" }] },
      }),
    });

    setup({ index, requestableIndexes: {} });

    expect(
      await screen.findByText("This index type is no longer available."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Give your index a name"),
    ).not.toBeInTheDocument();
  });
});

async function waitForBody(name: string) {
  await waitFor(() => {
    expect(fetchMock.callHistory.called(name)).toBe(true);
  });
  const call = fetchMock.callHistory.lastCall(name);
  return JSON.parse(call?.options?.body as string);
}
