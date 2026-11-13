import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Field } from "metabase-types/api";
import {
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { PersonColumnWidget } from "./PersonColumnWidget";

const EVENTS_ID = 1;

const USER_ID = createMockField({
  table_id: EVENTS_ID,
  name: "user_id",
  display_name: "User ID",
});

const USER_ID_WITH_FOREIGN_KEY = createMockField({
  ...USER_ID,
  semantic_type: "type/FK",
  target: createMockField({ table_id: 2, name: "id" }),
});

type SetupOpts = {
  userIdField?: Field;
  value?: string | null;
  canWriteTable?: boolean;
  isAdmin?: boolean;
};

const setup = ({
  userIdField = USER_ID,
  value = "user_id",
  canWriteTable = true,
  isAdmin = true,
}: SetupOpts = {}) => {
  const table = createMockTable({
    id: EVENTS_ID,
    db_id: 3,
    schema: "analytics",
    can_write: canWriteTable,
    fields: [userIdField],
  });
  renderWithProviders(
    <PersonColumnWidget
      id="columns.person"
      value={value}
      onChange={jest.fn<void, [string | null]>()}
      columns={[{ value: "user_id", label: "User ID" }]}
      isRequired
      table={table}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );
};

describe("PersonColumnWidget", () => {
  it("links to the table's fields while no people table is linked", () => {
    setup();

    expect(
      screen.getByText(/Link a people table to filter or break out/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up a foreign key" }),
    ).toHaveAttribute(
      "href",
      "/data-studio/data/database/3/schema/3:analytics/table/1/field",
    );
  });

  it("asks someone who can't edit the table to ask an admin", () => {
    setup({ canWriteTable: false });

    expect(
      screen.getByText(/Ask an admin to link a people table/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("asks someone without Data Studio access to ask an admin", () => {
    setup({ isAdmin: false });

    expect(
      screen.getByText(/Ask an admin to link a people table/),
    ).toBeInTheDocument();
  });

  it("says nothing once a people table is linked", () => {
    setup({ userIdField: USER_ID_WITH_FOREIGN_KEY });

    expect(screen.queryByText(/people table/)).not.toBeInTheDocument();
  });

  it("says nothing before a person column is picked", () => {
    setup({ value: null });

    expect(screen.queryByText(/people table/)).not.toBeInTheDocument();
  });
});
