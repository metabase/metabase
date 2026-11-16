import {
  setupSegmentsEndpointError,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import {
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import type { UsersTable } from "../../analyses/types";
import type { SegmentSource } from "../../segments/types";

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
  source?: SegmentSource;
  table?: Table;
  usersTable?: UsersTable;
  isUsersTableLinked: boolean;
  hasSegmentsError?: boolean;
};

const setup = ({
  source = "people",
  table = EVENT_TABLE,
  usersTable,
  isUsersTableLinked,
  hasSegmentsError = false,
}: SetupOpts) => {
  if (hasSegmentsError) {
    setupSegmentsEndpointError();
  } else {
    setupSegmentsEndpoints([]);
  }
  renderWithProviders(
    <SegmentsPanel
      source={source}
      table={table}
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

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByText(/Link a people table/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Draft a segment/ }),
    ).not.toBeInTheDocument();
  });

  it("waits for the event table rather than saying it has no segments", () => {
    setup({ source: "event", table: undefined, isUsersTableLinked: false });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByText(/No segments/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Draft a segment/ }),
    ).not.toBeInTheDocument();
  });

  it("shows an error rather than an empty list when segments fail to load", async () => {
    setup({
      source: "event",
      isUsersTableLinked: false,
      hasSegmentsError: true,
    });

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(screen.queryByText(/No segments/)).not.toBeInTheDocument();
  });

  it("lists the people table's segments once it's loaded", async () => {
    setup({ usersTable: USERS_TABLE, isUsersTableLinked: true });

    expect(
      await screen.findByText("No segments defined on Users yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Link a people table/)).not.toBeInTheDocument();
  });
});
