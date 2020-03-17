// import { getMetadata } from "metabase/selectors/metadata";
import { getParameters } from "metabase/dashboard/selectors";

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
        card: { id: 0 },
        parameter_mappings: [],
      },
      1: {
        card: { id: 1 },
        parameter_mappings: [],
      },
    },
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
          target: ["dimension", ["field-id", 1]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
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
          target: ["dimension", ["field-id", 1]],
        })
        .assocIn(["dashboard", "dashcards", 1, "parameter_mappings", 0], {
          card_id: 1,
          parameter_id: 1,
          target: ["dimension", ["field-id", 1]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
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
          target: ["dimension", ["field-id", 1]],
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
          target: ["dimension", ["field-id", 1]],
        })
        .assocIn(["dashboard", "dashcards", 1, "parameter_mappings", 0], {
          card_id: 1,
          parameter_id: 1,
          target: ["dimension", ["field-id", 2]],
        })
        .value();
      expect(getParameters(state)).toEqual([
        {
          id: 1,
          field_ids: [1, 2],
          field_id: null,
          hasOnlyFieldTargets: true,
        },
      ]);
    });
  });
});
