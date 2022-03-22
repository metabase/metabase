import {
  getParameters,
  getSidebar,
  getShowAddQuestionSidebar,
  getIsSharing,
  getEditingParameterId,
  getIsEditingParameter,
  getClickBehaviorSidebarDashcard,
} from "metabase/dashboard/selectors";
import { SIDEBAR_NAME } from "./constants";
import Field from "metabase-lib/lib/metadata/Field";
import { chain } from "icepick";

const STATE = {
  dashboard: {
    dashboardId: 0,
    dashboards: {
      0: {
        ordered_cards: [0, 1],
        parameters: [],
      },
    },
    dashcards: {
      0: {
        card: { id: 0, dataset_query: { type: "query", query: {} } },
        parameter_mappings: [],
      },
      1: {
        card: { id: 1, dataset_query: { type: "query", query: {} } },
        parameter_mappings: [],
      },
    },
    sidebar: {},
  },
  entities: {
    databases: {},
    schemas: {},
    tables: {},
    fields: {
      1: { id: 1 },
      2: { id: 2 },
    },
    metrics: {},
    segments: {},
  },
};

describe("dashboard/selectors", () => {
  describe("getParameters", () => {
    it("should work with no parameters", () => {
      expect(getParameters(STATE)).toEqual([]);
    });
    it("should not include field id with no mappings", () => {
      const state = chain(STATE)
        .assocIn(["dashboard", "dashboards", 0, "parameters", 0], { id: 1 })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          fields: [],
          field_ids: [],
          field_id: null,
          hasOnlyFieldTargets: true,
        },
      ]);
    });
    it("should not include field id with one mapping, no field id", () => {
      const state = chain(STATE)
        .assocIn(["dashboard", "dashboards", 0, "parameters", 0], { id: 1 })
        .assocIn(["dashboard", "dashcards", 0, "parameter_mappings", 0], {
          card_id: 0,
          parameter_id: 1,
          target: ["variable", ["template-tag", "foo"]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          fields: [],
          field_ids: [],
          field_id: null,
          hasOnlyFieldTargets: false,
        },
      ]);
    });
    it("should include field id with one mappings, with field id", () => {
      const state = chain(STATE)
        .assocIn(["dashboard", "dashboards", 0, "parameters", 0], { id: 1 })
        .assocIn(["dashboard", "dashcards", 0, "parameter_mappings", 0], {
          card_id: 0,
          parameter_id: 1,
          target: ["dimension", ["field", 1, null]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          fields: [expect.any(Field)],
          field_ids: [1],
          field_id: 1,
          hasOnlyFieldTargets: true,
        },
      ]);
    });
    it("should include field id with two mappings, with same field id", () => {
      const state = chain(STATE)
        .assocIn(["dashboard", "dashboards", 0, "parameters", 0], { id: 1 })
        .assocIn(["dashboard", "dashcards", 0, "parameter_mappings", 0], {
          card_id: 0,
          parameter_id: 1,
          target: ["dimension", ["field", 1, null]],
        })
        .assocIn(["dashboard", "dashcards", 1, "parameter_mappings", 0], {
          card_id: 1,
          parameter_id: 1,
          target: ["dimension", ["field", 1, null]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          fields: [expect.any(Field)],
          field_ids: [1],
          field_id: 1,
          hasOnlyFieldTargets: true,
        },
      ]);
    });
    it("should include field id with two mappings, one with field id, one without", () => {
      const state = chain(STATE)
        .assocIn(["dashboard", "dashboards", 0, "parameters", 0], { id: 1 })
        .assocIn(["dashboard", "dashcards", 0, "parameter_mappings", 0], {
          card_id: 0,
          parameter_id: 1,
          target: ["dimension", ["field", 1, null]],
        })
        .assocIn(["dashboard", "dashcards", 1, "parameter_mappings", 0], {
          card_id: 1,
          parameter_id: 1,
          target: ["variable", ["template-tag", "foo"]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          fields: [expect.any(Field)],
          field_ids: [1],
          field_id: 1,
          hasOnlyFieldTargets: false,
        },
      ]);
    });
    it("should include all field ids with two mappings, with different field ids", () => {
      const state = chain(STATE)
        .assocIn(["dashboard", "dashboards", 0, "parameters", 0], { id: 1 })
        .assocIn(["dashboard", "dashcards", 0, "parameter_mappings", 0], {
          card_id: 0,
          parameter_id: 1,
          target: ["dimension", ["field", 1, null]],
        })
        .assocIn(["dashboard", "dashcards", 1, "parameter_mappings", 0], {
          card_id: 1,
          parameter_id: 1,
          target: ["dimension", ["field", 2, null]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          fields: [expect.any(Field), expect.any(Field)],
          field_ids: [1, 2],
          field_id: null,
          hasOnlyFieldTargets: true,
        },
      ]);
    });
  });

  describe("getSidebar", () => {
    it("should return the sidebar property", () => {
      expect(getSidebar(STATE)).toBe(STATE.dashboard.sidebar);
    });
  });

  describe("getShowAddQuestionSidebar", () => {
    it("should return false when sidebar is not set to the add question sidebar", () => {
      expect(getShowAddQuestionSidebar(STATE)).toBe(false);
    });

    it("should returnftrue when the sidebar is set to the add question sidebar", () => {
      const state = {
        ...STATE,
        dashboard: {
          ...STATE.dashboard,
          sidebar: {
            name: SIDEBAR_NAME.addQuestion,
          },
        },
      };

      expect(getShowAddQuestionSidebar(state)).toBe(true);
    });
  });

  describe("getIsSharing", () => {
    it("should return false when dashboard is not shared", () => {
      expect(getIsSharing(STATE)).toBe(false);
    });

    it("should return true when dashboard is shared", () => {
      const state = {
        ...STATE,
        dashboard: {
          ...STATE.dashboard,
          sidebar: {
            name: SIDEBAR_NAME.sharing,
          },
        },
      };

      expect(getIsSharing(state)).toBe(true);
    });
  });

  describe("getEditingParameterId", () => {
    it("should return null when the edit parameter sidebar is not open", () => {
      expect(getEditingParameterId(STATE)).toBe(null);
    });

    it("should return the editing parameter id", () => {
      const state = {
        ...STATE,
        dashboard: {
          ...STATE.dashboard,
          sidebar: {
            name: SIDEBAR_NAME.editParameter,
            props: { parameterId: 1 },
          },
        },
      };

      expect(getEditingParameterId(state)).toBe(1);
    });
  });

  describe("getIsEditingParameterId", () => {
    it("should return false when the edit parameter sidebar is not open", () => {
      expect(getIsEditingParameter(STATE)).toBe(false);
    });

    it("should return false when the edit parameter sidebar is open but there is no set parameterId", () => {
      const state = {
        ...STATE,
        dashboard: {
          ...STATE.dashboard,
          sidebar: {
            name: SIDEBAR_NAME.editParameter,
          },
        },
      };

      expect(getIsEditingParameter(state)).toBe(false);
    });

    it("should return true when the edit parameter sidebar is open and there is a set parameterId", () => {
      const state = {
        ...STATE,
        dashboard: {
          ...STATE.dashboard,
          sidebar: {
            name: SIDEBAR_NAME.editParameter,
            props: {
              parameterId: 0,
            },
          },
        },
      };

      expect(getIsEditingParameter(state)).toBe(true);
    });
  });

  describe("getClickBehaviorSidebarDashcard", () => {
    it("should return null when the click behavior sidebar is not open", () => {
      expect(getClickBehaviorSidebarDashcard(STATE)).toBe(null);
    });

    it("should return the dashboard associated with the given set dashcardId if the click behavior sidebar is open", () => {
      const state = {
        ...STATE,
        dashboard: {
          ...STATE.dashboard,
          sidebar: {
            name: SIDEBAR_NAME.clickBehavior,
            props: {
              dashcardId: 1,
            },
          },
        },
      };

      expect(getClickBehaviorSidebarDashcard(state)).toEqual(
        state.dashboard.dashcards[1],
      );
    });
  });
});
