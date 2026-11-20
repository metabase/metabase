import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupNativeDatasetEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type {
  DatabaseNativePermissions,
  NativeDatasetResponse,
} from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { ViewSqlButton } from "./ViewSqlButton";

type SetupOpts = {
  nativePermissions?: DatabaseNativePermissions;
};

const setup = ({ nativePermissions = "write" }: SetupOpts = {}) => {
  const metadataProvider = createMetadataProvider({
    metadata: createMockMetadata({
      databases: [
        createSampleDatabase({ native_permissions: nativePermissions }),
      ],
    }),
  });
  const table = Lib.tableOrCardMetadata(metadataProvider, ORDERS_ID);
  if (table === null) {
    throw new Error("No ORDERS table");
  }
  const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
  renderWithProviders(<ViewSqlButton query={query} />);
};

describe("ViewSqlButton", () => {
  it("shows the SQL the analysis runs", async () => {
    const nativeQuery: NativeDatasetResponse = {
      query: "SELECT 'habit'",
      params: null,
    };
    setupNativeDatasetEndpoint(nativeQuery);
    setup();

    await userEvent.click(screen.getByRole("button", { name: "View the SQL" }));

    expect(
      await screen.findByRole("dialog", { name: "SQL for this analysis" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/SELECT 'habit'/)).toBeInTheDocument();
  });

  it("shows why the SQL couldn't be compiled", async () => {
    setupNativeDatasetEndpoint(
      new Response(JSON.stringify({ message: "Can't compile this query" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    setup();

    await userEvent.click(screen.getByRole("button", { name: "View the SQL" }));

    expect(
      await screen.findByText("Can't compile this query"),
    ).toBeInTheDocument();
  });

  it("isn't offered without permission to write native queries", () => {
    setup({ nativePermissions: "none" });

    expect(
      screen.queryByRole("button", { name: "View the SQL" }),
    ).not.toBeInTheDocument();
  });
});
