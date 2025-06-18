import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PgReplicationButton } from "./PgReplicationButton";

const setup = ({ databaseId = 1, settings = {} }) => {
  const storeInitialState = createMockState({
    settings: createMockSettingsState({
      "pg-replication-enabled": true,
      "pg-replication-connections": {},
      ...settings,
    }),
  });

  return renderWithProviders(<PgReplicationButton databaseId={databaseId} />, {
    storeInitialState,
  });
};

describe("PgReplicationButton", () => {
  beforeEach(() => {
    fetchMock.reset();
    // Mock the API endpoints
    fetchMock.post(
      "express:/api/ee/pg-replication/connection/:databaseId",
      200,
    );
    fetchMock.delete(
      "express:/api/ee/pg-replication/connection/:databaseId",
      200,
    );
  });

  afterEach(() => {
    fetchMock.restore();
  });

  describe("when pg-replication-enabled is false", () => {
    it("should not render button", () => {
      setup({ settings: { "pg-replication-enabled": false } });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("when pg-replication-enabled is true", () => {
    describe("and database has no replication connection", () => {
      it("should render 'Replicate to Data Warehouse' button", () => {
        setup({
          databaseId: 1,
          settings: { "pg-replication-connections": {} },
        });

        expect(
          screen.getByRole("button", { name: "Replicate to Data Warehouse" }),
        ).toBeInTheDocument();
      });

      it("should call create API when clicked", async () => {
        const view = userEvent.setup();
        setup({
          databaseId: 1,
          settings: { "pg-replication-connections": {} },
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
          /\/api\/ee\/pg-replication\/connection\/1$/,
        );
      });
    });

    describe("and database has replication connection", () => {
      it("should render 'Stop replicating to Data Warehouse' button", () => {
        setup({
          databaseId: 1,
          settings: {
            "pg-replication-connections": {
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
            "pg-replication-connections": {
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
          /\/api\/ee\/pg-replication\/connection\/1$/,
        );
      });
    });
  });
});
