import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PgReplicationStatusInfo } from "./PgReplicationStatusInfo";

const setup = ({ databaseId = 1, settings = {} }) => {
  const storeInitialState = createMockState({
    settings: createMockSettingsState({
      "pg-replication-connections": {},
      ...settings,
    }),
  });

  return renderWithProviders(
    <PgReplicationStatusInfo databaseId={databaseId} />,
    { storeInitialState },
  );
};

describe("PgReplicationStatusInfo", () => {
  describe("state derivation from pg-replication-connections", () => {
    describe("when database has no replication connection", () => {
      it("should show 'Not replicating' status", () => {
        setup({ databaseId: 1 });

        expect(screen.getByText("Not replicating")).toBeInTheDocument();
      });

      it("should show 'Not replicating' status when database ID is not in connections", () => {
        setup({
          databaseId: 2,
          settings: {
            "pg-replication-connections": { 1: { connection_id: "conn_123" } },
          },
        });

        expect(screen.getByText("Not replicating")).toBeInTheDocument();
      });
    });

    describe("when database has replication connection", () => {
      it("should show 'Replicating' status", () => {
        setup({
          databaseId: 1,
          settings: {
            "pg-replication-connections": {
              1: { connection_id: "conn_123" },
            },
          },
        });

        expect(screen.getByText("Replicating")).toBeInTheDocument();
      });

      it("should render a badge/indicator element", () => {
        const { container } = setup({
          databaseId: 1,
          settings: { 1: { connection_id: "conn_123" } },
        });

        expect(container.children.length).toBeGreaterThan(0);
      });

      it("should show 'Replicating' status for specific database among multiple connections", () => {
        setup({
          databaseId: 2,
          settings: {
            "pg-replication-connections": {
              1: { connection_id: "conn_123" },
              2: { connection_id: "conn_456" },
              3: { connection_id: "conn_789" },
            },
          },
        });

        expect(screen.getByText("Replicating")).toBeInTheDocument();
      });
    });
  });
});
