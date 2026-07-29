import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGetTransformEndpoint,
  setupListAnyDatabaseSchemasEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { SchemaName, Transform } from "metabase-types/api";
import {
  createMockTable,
  createMockTransform,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import { TransformOutput } from "./TransformOutput";

type SetupOpts = {
  transform?: Transform;
  schemas?: SchemaName[];
  error?: string;
};

const setup = async ({
  transform = createMockTransform(),
  schemas = [],
  error,
}: SetupOpts = {}) => {
  if (error === undefined) {
    setupGetTransformEndpoint(transform);
  } else {
    fetchMock.get(`path:/api/transform/${transform.id}`, {
      status: 500,
      body: { message: error },
    });
  }
  setupListAnyDatabaseSchemasEndpoint(schemas);
  renderWithProviders(<TransformOutput transformId={transform.id} />);
  await waitForLoaderToBeRemoved();
};

describe("TransformOutput", () => {
  it("should link the output schema and table", async () => {
    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({
          database: 2,
          schema: "mb_workspace_test",
          name: "orders",
        }),
        table: createMockTable({ id: 10, db_id: 2 }),
      }),
      schemas: ["mb_workspace_test"],
    });

    const schemaLink = screen.getByTestId("output-schema-link");
    expect(schemaLink).toHaveTextContent("mb_workspace_test");
    expect(schemaLink).toHaveAttribute(
      "href",
      "/admin/datamodel/database/2/schema/2:mb_workspace_test",
    );

    const tableLink = screen.getByTestId("output-table-link");
    expect(tableLink).toHaveTextContent("orders");
    expect(tableLink).toHaveAttribute("href", "/question#?db=2&table=10");
  });

  it("should not link the output table when it is not synced yet", async () => {
    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({ schema: "public", name: "orders" }),
        table: null,
      }),
    });

    const tableItem = screen.getByTestId("output-table-link");
    expect(tableItem).toHaveTextContent("orders");
    expect(tableItem).not.toHaveAttribute("href");
  });

  it("should not link a schema that does not exist in the database", async () => {
    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({ schema: "public", name: "orders" }),
        table: null,
      }),
      schemas: ["other"],
    });

    const schemaItem = screen.getByTestId("output-schema-link");
    expect(schemaItem).toHaveTextContent("public");
    expect(schemaItem).not.toHaveAttribute("href");
  });

  it("should still link an existing schema when the table is not synced yet", async () => {
    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({ schema: "public", name: "orders" }),
        table: null,
      }),
      schemas: ["public"],
    });

    expect(screen.getByTestId("output-schema-link")).toHaveAttribute(
      "href",
      "/admin/datamodel/database/1/schema/1:public",
    );
    expect(screen.getByTestId("output-table-link")).not.toHaveAttribute("href");
  });

  it("should not render a schema when the target has none", async () => {
    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({ schema: null, name: "orders" }),
        table: createMockTable({ id: 10, db_id: 1 }),
      }),
    });

    expect(screen.getByTestId("output-table-link")).toHaveTextContent("orders");
    expect(screen.queryByTestId("output-schema-link")).not.toBeInTheDocument();
  });

  it("should copy the qualified table name", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({
          schema: "mb_workspace_test",
          name: "orders",
        }),
      }),
    });

    await userEvent.click(screen.getByTestId("copy-button"));

    expect(writeText).toHaveBeenCalledWith("mb_workspace_test.orders");
  });

  it("should copy the bare table name when the target has no schema", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await setup({
      transform: createMockTransform({
        target: createMockTransformTarget({ schema: null, name: "orders" }),
      }),
    });

    await userEvent.click(screen.getByTestId("copy-button"));

    expect(writeText).toHaveBeenCalledWith("orders");
  });

  it("should render an error when the transform cannot be loaded", async () => {
    await setup({ error: "Boom" });

    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.queryByTestId("output-table-link")).not.toBeInTheDocument();
  });
});
