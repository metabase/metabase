import { renderHook } from "@testing-library/react";

import {
  setupCardDataset,
  setupFieldEndpoints,
} from "__support__/server-mocks";
import { waitFor } from "__support__/ui";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers as reducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import type { FieldId, RowValue } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useFieldDistinctValues } from "./use-field-distinct-values";

interface SetupOpts {
  fieldId: FieldId | undefined;
  rows?: RowValue[][];
}

function setup({ fieldId, rows }: SetupOpts) {
  if (fieldId != null) {
    const field = createMockField({
      id: fieldId,
      table_id: 10,
      table: createMockTable({ id: 10, db_id: 100 }),
    });

    setupFieldEndpoints(field);

    if (rows) {
      setupCardDataset({ data: { rows } });
    }
  }

  const store = getStore(reducers, undefined, createMockState());

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
    );
  }

  const { result } = renderHook(() => useFieldDistinctValues(fieldId), {
    wrapper: Wrapper,
  });

  return result;
}

describe("useFieldDistinctValues", () => {
  it("returns distinct values from ad-hoc query", async () => {
    const result = setup({
      fieldId: 1,
      rows: [["tenant_a"], ["tenant_b"], ["tenant_c"]],
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.values).toEqual(["tenant_a", "tenant_b", "tenant_c"]);
  });

  it("returns empty values when fieldId is undefined", async () => {
    const result = setup({ fieldId: undefined });

    expect(result.current.values).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("filters out null values from results", async () => {
    const result = setup({
      fieldId: 1,
      rows: [["tenant_a"], [null], ["tenant_b"], [null]],
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.values).toEqual(["tenant_a", "tenant_b"]);
  });

  it("converts numeric values to strings", async () => {
    const result = setup({
      fieldId: 1,
      rows: [[1], [2], [3]],
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.values).toEqual(["1", "2", "3"]);
  });
});
