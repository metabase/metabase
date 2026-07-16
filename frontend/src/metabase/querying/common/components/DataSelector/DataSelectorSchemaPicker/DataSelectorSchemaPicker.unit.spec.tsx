import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { Schema } from "metabase-types/api";

import { DataSelectorSchemaPicker } from "./DataSelectorSchemaPicker";

type SetupOpts = {
  schemas: Schema[];
};

const setup = ({ schemas }: SetupOpts) => {
  const onChangeSchema = jest.fn();

  render(
    <DataSelectorSchemaPicker
      schemas={schemas}
      hasFiltering
      hasInitialFocus
      hasNextStep={false}
      isLoading={false}
      onChangeSchema={onChangeSchema}
    />,
  );
};

describe("DataSelectorSchemaPicker", () => {
  it("displays schema name", () => {
    const schemaName = "Schema name";

    setup({
      schemas: [{ id: `1:${schemaName}`, name: schemaName }],
    });

    expect(
      screen.getByText(checkNotNull(getSchemaDisplayName(schemaName))),
    ).toBeInTheDocument();
  });

  it("keeps the search box visible and shows an empty state when no schema matches the search (GDGT-2845)", async () => {
    setup({
      schemas: [
        { id: "1:1", name: "First schema" },
        { id: "1:2", name: "Second schema" },
      ],
    });

    await userEvent.type(
      screen.getByPlaceholderText("Find..."),
      "xyznonexistent",
    );

    expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
    expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
    expect(screen.queryByText("First schema")).not.toBeInTheDocument();
    expect(screen.queryByText("Second schema")).not.toBeInTheDocument();
  });
});
