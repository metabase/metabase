import userEvent from "@testing-library/user-event";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { SchemaMultiSelect } from "./SchemaMultiSelect";

const TEST_DATABASE = createMockDatabase({
  id: 10,
  name: "Postgres",
  features: ["schemas"],
  tables: [
    createMockTable({ id: 100, db_id: 10, schema: "public", name: "orders" }),
    createMockTable({
      id: 101,
      db_id: 10,
      schema: "analytics",
      name: "events",
    }),
  ],
});

function setup({ value = [] as string[] } = {}) {
  const onChange = jest.fn();
  setupDatabasesEndpoints([TEST_DATABASE]);
  renderWithProviders(
    <SchemaMultiSelect
      databaseId={TEST_DATABASE.id}
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("SchemaMultiSelect", () => {
  it("can select the first schema", async () => {
    const { onChange } = setup();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "public" }),
    );

    expect(onChange).toHaveBeenCalledWith(["public"]);
  });

  it("can select the second schema", async () => {
    const { onChange } = setup({ value: ["public"] });

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "analytics" }),
    );

    expect(onChange).toHaveBeenCalledWith(["public", "analytics"]);
  });

  it("selects all schemas via the top-level checkbox", async () => {
    const { onChange } = setup({ value: ["public"] });

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select all" }),
    );

    expect(onChange).toHaveBeenCalledWith(["public", "analytics"]);
  });

  it("clears all schemas when all are already selected", async () => {
    const { onChange } = setup({ value: ["public", "analytics"] });

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select none" }),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
