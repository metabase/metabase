import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui";
import { getEntityLookups } from "metabase/querying/common/components/DataSelector";
import { checkNotNull } from "metabase/utils/types";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { DataSelectorSchemaPicker } from "./DataSelectorSchemaPicker";

interface SetupOpts {
  schemaNames: string[];
  onBack?: () => void;
}

const setup = ({ schemaNames, onBack }: SetupOpts) => {
  const database = createMockDatabase({
    id: 1,
    name: "Warehouse",
    tables: schemaNames.map((schema, index) =>
      createMockTable({ id: index + 1, db_id: 1, schema }),
    ),
  });
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [database] }),
  });
  const lookups = getEntityLookups(state);
  const onChangeSchema = jest.fn();

  render(
    <DataSelectorSchemaPicker
      schemas={lookups.databaseSchemas(database.id)}
      selectedDatabase={checkNotNull(lookups.database(database.id))}
      hasInitialFocus
      hasNextStep
      onBack={onBack}
      onChangeSchema={onChangeSchema}
    />,
  );

  return { onChangeSchema };
};

describe("DataSelectorSchemaPicker", () => {
  it("displays schema name", () => {
    const schemaName = "Schema name";
    setup({ schemaNames: [schemaName] });

    expect(
      screen.getByText(checkNotNull(getSchemaDisplayName(schemaName))),
    ).toBeInTheDocument();
  });

  it("goes back once when the Warehouse back link is clicked", async () => {
    const onBack = jest.fn();
    const { onChangeSchema } = setup({
      schemaNames: ["Accounting", "Finance"],
      onBack,
    });

    expect(screen.getByText("Accounting")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Warehouse"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onChangeSchema).not.toHaveBeenCalled();
  });

  it("goes back with Enter from the Warehouse back link without picking the schema under the list cursor", async () => {
    const onBack = jest.fn();
    const { onChangeSchema } = setup({
      schemaNames: ["Accounting", "Finance"],
      onBack,
    });

    // highlight a schema row, so an Enter that reaches the list would pick it
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    // focus the "‹ Warehouse" back link
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Warehouse" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onChangeSchema).not.toHaveBeenCalled();
  });

  it("goes back once with Space from the back link", async () => {
    const onBack = jest.fn();
    const { onChangeSchema } = setup({
      schemaNames: ["Accounting", "Finance"],
      onBack,
    });

    // focus the "‹ Warehouse" back link
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Warehouse" })).toHaveFocus();
    await userEvent.keyboard(" ");

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onChangeSchema).not.toHaveBeenCalled();
  });
});
