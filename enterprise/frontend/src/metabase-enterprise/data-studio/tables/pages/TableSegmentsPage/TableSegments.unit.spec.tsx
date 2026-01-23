import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings, Table } from "metabase-types/api";
import { createMockTable, createMockUser } from "metabase-types/api/mocks";

import { TableSegments } from "./TableSegments";

type SetupOpts = {
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  table?: Partial<Table>;
};

const setup = ({
  isAdmin = true,
  remoteSyncType,
  table = {},
}: SetupOpts = {}) => {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    is_published: true,
    ...table,
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
  describe("'new segment' link", () => {
    it("is rendered when user is an admin", () => {
      setup({ isAdmin: true });

      expect(
        screen.getByRole("link", { name: /New segment/i }),
      ).toBeInTheDocument();
    });

    it("is not rendered when user is not an admin", () => {
      setup({ isAdmin: false });

      expect(
        screen.queryByRole("link", { name: /New segment/i }),
      ).not.toBeInTheDocument();
    });

    it("is not rendered when remote sync is set to read-only", () => {
      setup({ isAdmin: true, remoteSyncType: "read-only" });

      expect(
        screen.queryByRole("link", { name: /New segment/i }),
      ).not.toBeInTheDocument();
    });

    it("is still rendered when remote sync is set to read-only but table is not published", () => {
      setup({
        isAdmin: true,
        remoteSyncType: "read-only",
        table: { is_published: false },
      });

      expect(
        screen.getByRole("link", { name: /New segment/i }),
      ).toBeInTheDocument();
    });
  });
});
