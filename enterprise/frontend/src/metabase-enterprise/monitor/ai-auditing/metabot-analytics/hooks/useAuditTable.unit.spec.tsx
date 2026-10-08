import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { AUDIT_DB_ID } from "../constants";

import { useAuditTable } from "./useAuditTable";

const METADATA_URL = `path:/api/database/${AUDIT_DB_ID}/metadata`;

describe("useAuditTable", () => {
  it("returns the error when the metadata request fails", async () => {
    fetchMock.get(METADATA_URL, {
      status: 500,
      body: { message: "boom" },
    });

    const { result } = renderHookWithProviders(
      () => useAuditTable("v_api_key_usage"),
      {},
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeDefined();
    expect(result.current.table).toBeNull();
  });

  it("returns no error when the lookup succeeds but the view isn't there", async () => {
    fetchMock.get(
      METADATA_URL,
      createMockDatabase({ id: AUDIT_DB_ID, tables: [] }),
    );

    const { result } = renderHookWithProviders(
      () => useAuditTable("v_api_key_usage"),
      {},
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeUndefined();
    expect(result.current.table).toBeNull();
  });
});
