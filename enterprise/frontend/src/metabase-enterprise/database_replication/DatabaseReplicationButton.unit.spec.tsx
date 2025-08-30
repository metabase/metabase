import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseReplicationButton } from "./DatabaseReplicationButton";

const setup = ({ databaseId = 1, settings = {} }) => {
  const storeInitialState = createMockState({
    settings: createMockSettingsState({
      "database-replication-enabled": true,
      "database-replication-connections": {},
      ...settings,
    }),
  });

  fetchMock.post(
    "express:/api/ee/database-replication/connection/:databaseId",
    200,
  );
  fetchMock.delete(
    "express:/api/ee/database-replication/connection/:databaseId",
    200,
  );

  return renderWithProviders(
    <DatabaseReplicationButton databaseId={databaseId} />,
    {
      storeInitialState,
    },
  );
};

describe("DatabaseReplicationButton", () => {
  describe("when database-replication-enabled is false", () => {
    it("should not render button", () => {
      setup({ settings: { "database-replication-enabled": false } });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("when database-replication-enabled is true", () => {
    describe("and database has no replication connection", () => {
      it("should render 'Replicate to Data Warehouse' button", () => {
        setup({
          databaseId: 1,
          settings: { "database-replication-connections": {} },
        });

        expect(
          screen.getByRole("button", { name: "Replicate to Data Warehouse" }),
        ).toBeInTheDocument();
      });

      it("should call create API when clicked", async () => {
        const view = userEvent.setup();
        setup({
          databaseId: 1,
          settings: { "database-replication-connections": {} },
        });

        await view.click(
          screen.getByRole("button", { name: "Replicate to Data Warehouse" }),
        );

        await waitFor(async () => {
          const requests = await findRequests("POST");
          expect(requests).toHaveLength(1);
        });

        const requests = await findRequests("POST");
        expect(requests[0].url).toMatch(
          /\/api\/ee\/database-replication\/connection\/1$/,
        );
      });
    });

    describe("and database has replication connection", () => {
      it("should render 'Stop replicating to Data Warehouse' button", () => {
        setup({
          databaseId: 1,
          settings: {
            "database-replication-connections": {
              1: { connection_id: "conn_123" },
            },
          },
        });

        expect(
          screen.getByRole("button", {
            name: "Stop replicating to Data Warehouse",
          }),
        ).toBeInTheDocument();
      });

      it("should call delete API when clicked", async () => {
        const view = userEvent.setup();
        setup({
          databaseId: 1,
          settings: {
            "database-replication-connections": {
              1: { connection_id: "conn_123" },
            },
          },
        });

        await view.click(
          screen.getByRole("button", {
            name: "Stop replicating to Data Warehouse",
          }),
        );

        await waitFor(async () => {
          const requests = await findRequests("DELETE");
          expect(requests).toHaveLength(1);
        });

        const requests = await findRequests("DELETE");
        expect(requests[0].url).toMatch(
          /\/api\/ee\/database-replication\/connection\/1$/,
        );
      });
    });
  });
});
