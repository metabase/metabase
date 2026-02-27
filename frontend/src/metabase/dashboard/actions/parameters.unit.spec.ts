import { getStore } from "__support__/entities-store";
import { getParameters } from "metabase/dashboard/selectors";
import { mainReducers } from "metabase/reducers-main";
import {
  createMockCard,
  createMockDashboardCard,
  createMockNativeDatasetQuery,
  createMockParameter,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { createMockNormalizedField } from "metabase-types/api/mocks/schema";
import type { State } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import {
  REMOVE_PARAMETER,
  removeParameter,
  setOrUnsetParameterValues,
  setParameterIsMultiSelect,
  setParameterMapping,
  setParameterType,
} from "./parameters";

function setup({ routing, ...initialState }: State) {
  return getStore(mainReducers, initialState);
}

describe("setParameterType", () => {
  const state = createMockState({
    dashboard: createMockDashboardState({
      dashboardId: 1,
      dashboards: {
        "1": createMockStoreDashboard({
          id: 1,
          dashcards: [1],
          parameters: [
            createMockParameter({
              id: "1",
              type: "string/=",
              sectionId: "string",
            }),
            createMockParameter({
              id: "2",
              type: "string/=",
              sectionId: "string",
            }),
          ],
        }),
      },
      dashcards: {
        "1": createMockDashboardCard({
          id: 1,
          card_id: 1,
          card: createMockCard({
            id: 1,
            dataset_query: createMockNativeDatasetQuery(),
          }),
          series: [
            createMockCard({
              id: 2,
              dataset_query: createMockNativeDatasetQuery(),
            }),
            createMockCard({
              id: 3,
              dataset_query: createMockStructuredDatasetQuery(),
            }),
            createMockCard({
              id: 4,
              dataset_query: createMockNativeDatasetQuery(),
            }),
          ],
          parameter_mappings: [
            {
              parameter_id: "1",
              card_id: 1,
              target: ["dimension", ["field", 1, null]],
            },
            {
              parameter_id: "1",
              card_id: 2,
              target: ["dimension", ["field", 1, null]],
            },
            {
              parameter_id: "1",
              card_id: 3,
              target: ["dimension", ["field", 1, null]],
            },
            {
              parameter_id: "1",
              card_id: 4,
              target: ["dimension", ["field", 1, null]],
            },
            {
              parameter_id: "2",
              card_id: 4,
              target: ["dimension", ["field", 1, null]],
            },
          ],
        }),
      },
    }),
  });

  it("should reset all parameter mappings when the section changes", async () => {
    const store = setup(state);
    await store.dispatch(setParameterType("1", "string/=", "location"));
    expect(store.getState()).toMatchObject({
      dashboard: {
        dashcards: {
          "1": {
            parameter_mappings: [{ parameter_id: "2", card_id: 4 }],
          },
        },
      },
    });
  });

  it("should reset native query parameter mappings only when the type changes but section does not", async () => {
    const store = setup(state);
    await store.dispatch(setParameterType("1", "string/!=", "string"));
    expect(store.getState()).toMatchObject({
      dashboard: {
        dashcards: {
          "1": {
            parameter_mappings: [
              { parameter_id: "1", card_id: 3 },
              { parameter_id: "2", card_id: 4 },
            ],
          },
        },
      },
    });
  });
});

describe("setParameterIsMultiSelect", () => {
  it.each([
    {
      isMultiSelect: false,
      currentDefault: ["A", "B"],
      expectedDefault: ["A"],
    },
    {
      isMultiSelect: false,
      currentDefault: [1, 2],
      expectedDefault: [1],
    },
    {
      isMultiSelect: true,
      currentDefault: ["A", "B"],
      expectedDefault: ["A", "B"],
    },
    {
      isMultiSelect: false,
      currentDefault: null,
      expectedDefault: null,
    },
    {
      isMultiSelect: false,
      currentDefault: "ABC",
      expectedDefault: "ABC",
    },
  ])(
    "should coerce the default parameter value when no longer multi-select",
    async ({ isMultiSelect, currentDefault, expectedDefault }) => {
      const store = setup(
        createMockState({
          dashboard: createMockDashboardState({
            dashboardId: 1,
            dashboards: {
              "1": createMockStoreDashboard({
                id: 1,
                parameters: [
                  createMockParameter({ id: "123", default: currentDefault }),
                ],
              }),
            },
          }),
        }),
      );
      await store.dispatch(setParameterIsMultiSelect("123", isMultiSelect));
      const [parameter] = getParameters(store.getState());
      expect(parameter.default).toEqual(expectedDefault);
    },
  );
});

describe("removeParameter", () => {
  it("should return the `parameterId` as `payload.id` (metabase#33826)", async () => {
    const store = setup(
      createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              parameters: [
                createMockParameter({ id: "123" }),
                createMockParameter({ id: "456" }),
              ],
            }),
          },
        }),
      }),
    );

    const result = await store.dispatch(removeParameter("123"));

    expect(result).toEqual({
      type: REMOVE_PARAMETER,
      payload: { id: "123" },
    });
  });
});

describe("setParameterMapping", () => {
  describe("QUE2-326: updates ID parameter type when mapped to a field", () => {
    function setupIdMapping({
      fieldId,
      fieldBaseType,
    }: {
      fieldId: number | undefined;
      fieldBaseType: string;
    }) {
      const state = createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              dashcards: [1],
              parameters: [
                createMockParameter({
                  id: "id-param",
                  type: "id",
                  sectionId: "id",
                }),
              ],
            }),
          },
          dashcards: {
            "1": createMockDashboardCard({
              id: 1,
              card_id: 1,
              card: createMockCard({
                id: 1,
                dataset_query: createMockStructuredDatasetQuery(),
              }),
            }),
          },
        }),
        entities: {
          actions: {},
          collections: {},
          dashboards: {},
          databases: {},
          documents: {},
          schemas: {},
          tables: {},
          fields:
            fieldId != null
              ? {
                  [String(fieldId)]: createMockNormalizedField({
                    id: fieldId,
                    uniqueId: String(fieldId),
                    base_type: fieldBaseType,
                  }),
                }
              : {},
          segments: {},
          measures: {},
          snippets: {},
          questions: {},
          indexedEntities: {},
        },
      });
      const store = setup(state);
      return { store };
    }

    it("should update type to number/= when mapped to a numeric field by ID", async () => {
      const { store } = setupIdMapping({
        fieldId: 42,
        fieldBaseType: "type/Integer",
      });
      await store.dispatch(
        setParameterMapping("id-param", 1, 1, [
          "dimension",
          ["field", 42, null],
        ]),
      );
      const [param] = getParameters(store.getState());
      expect(param.type).toBe("number/=");
    });

    it("should update type to string/= when mapped to a text field by ID", async () => {
      const { store } = setupIdMapping({
        fieldId: 43,
        fieldBaseType: "type/Text",
      });
      await store.dispatch(
        setParameterMapping("id-param", 1, 1, [
          "dimension",
          ["field", 43, null],
        ]),
      );
      const [param] = getParameters(store.getState());
      expect(param.type).toBe("string/=");
    });

    it("should update type to number/= when mapped to a numeric field by name", async () => {
      const { store } = setupIdMapping({
        fieldId: undefined,
        fieldBaseType: "type/Integer",
      });
      await store.dispatch(
        setParameterMapping("id-param", 1, 1, [
          "dimension",
          ["field", "USER_ID", { "base-type": "type/Integer" }],
        ]),
      );
      const [param] = getParameters(store.getState());
      expect(param.type).toBe("number/=");
    });

    it("should update type to string/= when mapped to a text field by name", async () => {
      const { store } = setupIdMapping({
        fieldId: undefined,
        fieldBaseType: "type/Text",
      });
      await store.dispatch(
        setParameterMapping("id-param", 1, 1, [
          "dimension",
          ["field", "EMAIL", { "base-type": "type/Text" }],
        ]),
      );
      const [param] = getParameters(store.getState());
      expect(param.type).toBe("string/=");
    });

    it("should not change type for non-id parameters", async () => {
      const state = createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              dashcards: [1],
              parameters: [
                createMockParameter({
                  id: "str-param",
                  type: "string/=",
                  sectionId: "string",
                }),
              ],
            }),
          },
          dashcards: {
            "1": createMockDashboardCard({
              id: 1,
              card_id: 1,
              card: createMockCard({
                id: 1,
                dataset_query: createMockStructuredDatasetQuery(),
              }),
            }),
          },
        }),
        entities: {
          actions: {},
          collections: {},
          dashboards: {},
          databases: {},
          documents: {},
          schemas: {},
          tables: {},
          fields: {
            "42": createMockNormalizedField({
              id: 42,
              uniqueId: "42",
              base_type: "type/Integer",
            }),
          },
          segments: {},
          measures: {},
          snippets: {},
          questions: {},
          indexedEntities: {},
        },
      });
      const store = setup(state);
      await store.dispatch(
        setParameterMapping("str-param", 1, 1, [
          "dimension",
          ["field", 42, null],
        ]),
      );
      const [param] = getParameters(store.getState());
      expect(param.type).toBe("string/=");
    });
  });
});

describe("setOrUnsetParameterValues", () => {
  it("should set parameter value to default when parameter is required and has a default value", async () => {
    const store = setup(
      createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              parameters: [
                createMockParameter({
                  id: "123",
                  default: "default-value",
                  required: true,
                }),
              ],
            }),
          },
          parameterValues: {
            "123": "current-value",
          },
        }),
      }),
    );

    await store.dispatch(setOrUnsetParameterValues([["123", "current-value"]]));

    const state = store.getState();
    expect(state.dashboard.parameterValues["123"]).toBe("default-value");
  });

  it("should set parameter to provided value when parameter does not have a default value", async () => {
    const store = setup(
      createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            "1": createMockStoreDashboard({
              id: 1,
              parameters: [
                createMockParameter({
                  id: "123",
                }),
              ],
            }),
          },
          parameterValues: {
            "123": "current-value",
          },
        }),
      }),
    );

    await store.dispatch(setOrUnsetParameterValues([["123", "current-value"]]));

    const state = store.getState();
    expect(state.dashboard.parameterValues["123"]).toBe(null);
  });
});
