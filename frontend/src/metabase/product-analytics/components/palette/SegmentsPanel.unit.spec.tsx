import { setupSegmentsEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import type { UsersTable } from "../../analyses/types";

import { SegmentsPanel } from "./SegmentsPanel";

const EVENT_TABLE = createMockTable({ id: 1, display_name: "Events" });

const USERS_TABLE: UsersTable = {
  link: { tableId: 2, foreignKey: "user_id", primaryKey: "id" },
  table: createMockTable({
    id: 2,
    display_name: "Users",
    fields: [createMockField({ table_id: 2, name: "id" })],
  }),
};

type SetupOpts = {
  usersTable?: UsersTable;
  isUsersTableLinked: boolean;
};

const setup = ({ usersTable, isUsersTableLinked }: SetupOpts) => {
  setupSegmentsEndpoints([]);
  renderWithProviders(
    <SegmentsPanel
      source="people"
      table={EVENT_TABLE}
      usersTable={usersTable}
      isUsersTableLinked={isUsersTableLinked}
      onClose={jest.fn<void, []>()}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
};

describe("SegmentsPanel", () => {
  it("asks for a people table while none is linked", () => {
    setup({ isUsersTableLinked: false });

    expect(
      screen.getByText(/Link a people table to filter or break out/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Draft a segment/ }),
    ).not.toBeInTheDocument();
  });

  it("waits for a linked people table rather than asking for one", () => {
    setup({ isUsersTableLinked: true });

    expect(screen.queryByText(/Link a people table/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Draft a segment/ }),
    ).not.toBeInTheDocument();
  });

  it("lists the people table's segments once it's loaded", async () => {
    setup({ usersTable: USERS_TABLE, isUsersTableLinked: true });

    expect(
      await screen.findByText("No segments on this table yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Link a people table/)).not.toBeInTheDocument();
  });
});
