import type {
  UpdateTableCellRequest,
  UpdateTableCellResponse,
} from "metabase-enterprise/data_editing/tables/types";

import { EnterpriseApi } from "./api";

export const tableDataEditApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    updateTableCell: builder.mutation<
      UpdateTableCellResponse,
      UpdateTableCellRequest
    >({
      query: ({ fieldId, rowId, newValue }) => ({
        method: "PUT",
        url: `/api/ee/data-editing/field/${fieldId}/${rowId}`,
        body: {
          value: newValue,
        },
      }),
    }),
  }),
});

export const { useUpdateTableCellMutation } = tableDataEditApi;
