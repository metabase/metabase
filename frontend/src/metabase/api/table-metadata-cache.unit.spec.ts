import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { Api } from "./api";
import { fieldApi } from "./field";
import { tableApi } from "./table";

let activeStore: ReturnType<typeof getStore> | undefined;

type SetupOpts = {
  fieldId: number;
  tableId: number;
  updateFails?: boolean;
};

function setup({ fieldId, tableId, updateFails = false }: SetupOpts) {
  const field = createMockField({ id: fieldId, display_name: "Quantity" });
  const table = createMockTable({ id: tableId, fields: [field] });

  fetchMock.get(`path:/api/table/${tableId}/query_metadata`, table);
  fetchMock.put(
    `path:/api/field/${fieldId}`,
    updateFails ? 500 : { ...field, display_name: "Quantity a" },
  );

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);

  activeStore = store;

  const cachedFieldName = () => {
    const queries =
      // The store is typed from its reducers, so the RTK Query slice is opaque.
      (
        store.getState() as unknown as Record<
          string,
          {
            queries: Record<
              string,
              { data?: { id: number; fields?: { display_name: string }[] } }
            >;
          }
        >
      )[Api.reducerPath].queries;

    return Object.values(queries).find((entry) => entry.data?.id === tableId)
      ?.data?.fields?.[0].display_name;
  };

  const loadTable = async () => {
    store.dispatch(
      tableApi.endpoints.getTableQueryMetadata.initiate({ id: tableId }),
    );
    await waitFor(() => {
      expect(cachedFieldName()).toBe("Quantity");
    });
  };

  const renameField = () =>
    store.dispatch(
      fieldApi.endpoints.updateField.initiate({
        id: fieldId,
        display_name: "Quantity a",
      }),
    );

  return { cachedFieldName, loadTable, renameField };
}

describe("cached table metadata", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("writes an updated field into cached table metadata before the request resolves", async () => {
    const { cachedFieldName, loadTable, renameField } = setup({
      fieldId: 10,
      tableId: 1,
    });

    await loadTable();
    renameField();

    expect(cachedFieldName()).toBe("Quantity a");
  });

  it("rolls the write back when the request fails", async () => {
    const { cachedFieldName, loadTable, renameField } = setup({
      fieldId: 20,
      tableId: 2,
      updateFails: true,
    });

    await loadTable();
    renameField();
    expect(cachedFieldName()).toBe("Quantity a");

    await waitFor(() => {
      expect(cachedFieldName()).toBe("Quantity");
    });
  });
});
