import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database, User } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import DatabaseStatus from "./DatabaseStatus";

interface SetupOpts {
  user?: User;
  databases?: Database[];
}

const setup = ({ user, databases }: SetupOpts = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
  });
  const metadata = getMetadata(state);

  renderWithProviders(
    <DatabaseStatus
      user={user}
      databases={databases?.map(({ id }) =>
        checkNotNull(metadata.database(id)),
      )}
    />,
    { storeInitialState: state },
  );
};

describe("DatabaseStatus", () => {
  it("should toggle between small and large versions", async () => {
    setup({
      user: createMockUser({ id: 1 }),
      databases: [
        createMockDatabase({
          creator_id: 1,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    expect(screen.getByText("Syncing…")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("status"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("should not render when data is not loaded", () => {
    setup();

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("should not render when databases are created by another user", () => {
    setup({
      user: createMockUser({ id: 1 }),
      databases: [
        createMockDatabase({
          creator_id: 2,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });
});
