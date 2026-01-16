import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockTable, createMockUser } from "metabase-types/api/mocks";

import { TableSegments } from "./TableSegments";

type SetupOpts = {
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ isAdmin = true, remoteSyncType }: SetupOpts = {}) => {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
  });

  renderWithProviders(
    <Route path="/" component={() => <TableSegments table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: {
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
        currentUser: createMockUser({ is_superuser: isAdmin }),
      },
    },
  );
};

describe("TableSegments", () => {
  it("renders the new segment button", () => {
    setup();
    expect(
      screen.getByRole("link", { name: /New segment/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New segment/ })).toHaveAttribute(
      "href",
      "/data-studio/library/tables/1/segments/new",
    );
  });

  it("does not render the new segment button if remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("link", { name: /New segment/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render the new segment button if the user is not an admin", () => {
    setup({ isAdmin: false });
    expect(
      screen.queryByRole("link", { name: /New segment/ }),
    ).not.toBeInTheDocument();
  });
});
