import fetchMock, { type CallLog } from "fetch-mock";

import type {
  Field,
  FieldDimension,
  FieldId,
  FieldValue,
  GetFieldValuesResponse,
  Table,
  TableId,
} from "metabase-types/api";
import { createMockFieldDimension } from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

type SetupDataModelBackendOpts = {
  tables: Table[];
  fieldValues?: Partial<Record<FieldId, FieldValue[]>>;
};

/**
 * A data model backend that keeps state. Each write changes the stored table,
 * field, field values or dimension inside the handler of its own request, and
 * each read returns what is stored, so a control can only show a restored
 * value if the undo request sent it.
 *
 * Like the real backend, `GET /api/field/:id/values` returns values only for
 * fields whose `has_field_values` is "list"
 * (warehouse_schema_rest/api/field_test.clj).
 *
 * Call it before the generic server mocks: fetch-mock uses the first route
 * that matches a request.
 */
export function setupDataModelBackend({
  tables,
  fieldValues = {},
}: SetupDataModelBackendOpts) {
  const tablesById = new Map<TableId, Table>(
    tables.map((table) => [table.id, structuredClone(table)]),
  );
  const valuesByFieldId = new Map<FieldId, FieldValue[]>();
  Object.entries(fieldValues).forEach(([id, values]) => {
    valuesByFieldId.set(Number(id), values ?? []);
  });

  const getStoredTable = (id: TableId): Table => {
    const table = tablesById.get(id);
    if (!table) {
      throw new Error(`Unknown table ${id}`);
    }
    return table;
  };

  const getStoredField = (id: FieldId): Field => {
    const field = [...tablesById.values()]
      .flatMap((table) => table.fields ?? [])
      .find((field) => field.id === id);
    if (!field) {
      throw new Error(`Unknown field ${id}`);
    }
    return field;
  };

  tablesById.forEach((table) => {
    const tableId = table.id;

    fetchMock.get({
      url: `path:/api/table/${tableId}/query_metadata`,
      name: `stateful-table-${tableId}-query-metadata`,
      response: () => structuredClone(getStoredTable(tableId)),
    });
    fetchMock.put({
      url: `path:/api/table/${tableId}/fields/order`,
      name: `stateful-table-${tableId}-fields-order`,
      response: (call) => {
        const fieldOrder = getRequestBody(call);
        if (!isFieldIds(fieldOrder)) {
          return { status: 400 };
        }
        const storedTable = getStoredTable(tableId);
        storedTable.field_order = "custom";
        storedTable.fields?.forEach((field) => {
          field.position = fieldOrder.indexOf(Number(field.id));
        });
        return {};
      },
    });
    fetchMock.put({
      url: `path:/api/table/${tableId}`,
      name: `stateful-table-${tableId}-put`,
      response: (call) => {
        const body = getRequestBody(call);
        if (!isObject(body)) {
          return { status: 400 };
        }
        const storedTable = getStoredTable(tableId);
        Object.assign(storedTable, body);
        return structuredClone(storedTable);
      },
    });

    table.fields?.forEach((field) => {
      const fieldId = Number(field.id);

      fetchMock.get({
        url: `path:/api/field/${fieldId}`,
        name: `stateful-field-${fieldId}-get`,
        response: () => structuredClone(getStoredField(fieldId)),
      });
      fetchMock.put({
        url: `path:/api/field/${fieldId}`,
        name: `stateful-field-${fieldId}-put`,
        response: (call) => {
          const body = getRequestBody(call);
          if (!isObject(body)) {
            return { status: 400 };
          }
          const storedField = getStoredField(fieldId);
          Object.assign(storedField, body);
          return structuredClone(storedField);
        },
      });
      fetchMock.get({
        url: `path:/api/field/${fieldId}/values`,
        name: `stateful-field-${fieldId}-values`,
        response: (): GetFieldValuesResponse => ({
          field_id: fieldId,
          values:
            getStoredField(fieldId).has_field_values === "list"
              ? (valuesByFieldId.get(fieldId) ?? [])
              : [],
          has_more_values: false,
        }),
      });
      fetchMock.post({
        url: `path:/api/field/${fieldId}/values`,
        name: `stateful-field-${fieldId}-values-post`,
        response: (call) => {
          const body = getRequestBody(call);
          if (!isObject(body) || !isFieldValues(body.values)) {
            return { status: 400 };
          }
          valuesByFieldId.set(fieldId, body.values);
          return { status: 200, body: { status: "success" } };
        },
      });
      fetchMock.post({
        url: `path:/api/field/${fieldId}/dimension`,
        name: `stateful-field-${fieldId}-dimension-post`,
        response: (call) => {
          const body = getRequestBody(call);
          if (!isObject(body) || !isDimensionType(body.type)) {
            return { status: 400 };
          }
          const dimension = createMockFieldDimension({
            field_id: fieldId,
            type: body.type,
            name: String(body.name),
            ...(typeof body.human_readable_field_id === "number" && {
              human_readable_field_id: body.human_readable_field_id,
            }),
          });
          getStoredField(fieldId).dimensions = [dimension];
          return dimension;
        },
      });
      fetchMock.delete({
        url: `path:/api/field/${fieldId}/dimension`,
        name: `stateful-field-${fieldId}-dimension-delete`,
        response: () => {
          getStoredField(fieldId).dimensions = [];
          return {};
        },
      });
    });
  });

  return {
    getField: (id: FieldId) => structuredClone(getStoredField(id)),
    getTable: (id: TableId) => structuredClone(getStoredTable(id)),
    getFieldValues: (id: FieldId) => valuesByFieldId.get(id) ?? [],
  };
}

/** The parsed JSON bodies of the requests a route got, oldest first. */
export function getRequestBodies(routeName: string): unknown[] {
  return fetchMock.callHistory
    .calls(routeName)
    .map((call) => getRequestBody(call));
}

export function getLastRequestBody(routeName: string): unknown {
  return getRequestBodies(routeName).at(-1);
}

function getRequestBody(call: CallLog): unknown {
  const body = call.options.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

function isFieldIds(value: unknown): value is FieldId[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "number")
  );
}

function isFieldValues(value: unknown): value is FieldValue[] {
  return Array.isArray(value) && value.every((item) => Array.isArray(item));
}

function isDimensionType(value: unknown): value is FieldDimension["type"] {
  return value === "internal" || value === "external";
}
