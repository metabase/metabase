import { checkNotNull } from "metabase/lib/types";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { ParameterValueOrArray } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import {
  canResetFilter,
  setDashboardHeaderParameterIndex,
  syncParametersAndEmbeddingParams,
} from "./parameter-utils";

describe("Parameter utils", () => {
  describe("syncParametersAndEmbeddingParams", () => {
    it("should rename `embedding_params` that are renamed in `parameters`", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
        enable_embedding: true,
      };
      const after = {
        parameters: [{ slug: "new_id", id: "unique-param-id" }],
      };

      const expectation = { new_id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should remove `embedding_params` that are removed from `parameters`", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
        enable_embedding: true,
      };
      const after = {
        parameters: [],
      };

      const expectation = {};

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should not change `embedding_params` when `parameters` hasn't changed", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
        enable_embedding: true,
      };
      const after = {
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };

      const expectation = { id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should not try to change `embedding_params` if `enable_embedding` is false (metabase#61516)", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
        enable_embedding: false,
      };
      const after = {
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };

      const expectation = { id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });
  });

  describe("canResetFilter", () => {
    function getEmptyDefaultValueCases({
      default: defaultValue,
    }: {
      default: ParameterValueOrArray | undefined | null;
    }) {
      return [
        { default: defaultValue, value: null, expected: false },
        { default: defaultValue, value: undefined, expected: false },
        { default: defaultValue, value: "", expected: false },
        { default: defaultValue, value: [], expected: false },
        { default: defaultValue, value: "a", expected: true },
        { default: defaultValue, value: 0, expected: true },
        { default: defaultValue, value: ["a"], expected: true },
        { default: defaultValue, value: [0], expected: true },
      ];
    }

    it.each<{
      default: ParameterValueOrArray | undefined | null;
      value: ParameterValueOrArray | undefined | null;
      expected: boolean;
    }>([
      ...getEmptyDefaultValueCases({ default: null }),
      ...getEmptyDefaultValueCases({ default: undefined }),
      ...getEmptyDefaultValueCases({ default: "" }),
      ...getEmptyDefaultValueCases({ default: [] }),

      { default: "a", value: null, expected: true },
      { default: "a", value: undefined, expected: true },
      { default: "a", value: "", expected: true },
      { default: "a", value: [], expected: true },
      { default: "a", value: "a", expected: false },
      { default: "a", value: "b", expected: true },
      { default: "a", value: 0, expected: true },
      { default: "a", value: ["a"], expected: false }, // interesting case
      { default: "a", value: [0], expected: true },

      { default: 0, value: null, expected: true },
      { default: 0, value: undefined, expected: true },
      { default: 0, value: "", expected: true },
      { default: 0, value: [], expected: true },
      { default: 0, value: "a", expected: true },
      { default: 0, value: 0, expected: false },
      { default: 0, value: 1, expected: true },
      { default: 0, value: ["a"], expected: true },
      { default: 0, value: [0], expected: false }, // interesting case

      { default: ["a"], value: null, expected: true },
      { default: ["a"], value: undefined, expected: true },
      { default: ["a"], value: "", expected: true },
      { default: ["a"], value: [], expected: true },
      { default: ["a"], value: "a", expected: false }, // interesting case
      { default: ["a"], value: "b", expected: true },
      { default: ["a"], value: 0, expected: true },
      { default: ["a"], value: ["a"], expected: false },
      { default: ["a"], value: ["b"], expected: true },
      { default: ["a"], value: [0], expected: true },

      { default: [1, 0], value: [0, 1], expected: false }, // order is not important
      { default: [1, 0], value: [0, 1, 2], expected: true },
      { default: [1, 0], value: [0], expected: true },

      { default: ["a", "b"], value: ["b", "a"], expected: false }, // order is not important
      { default: ["a", "b"], value: ["b", "a", "c"], expected: true },
      { default: ["a", "b"], value: ["b"], expected: true },
    ])(
      "default = `$default` | value = `$value` | expected = `$expected`",
      ({ default: defaultValue, value, expected }) => {
        const parameter = createMockUiParameter({
          default: defaultValue,
          value,
        });

        expect(canResetFilter(parameter)).toBe(expected);
      },
    );
  });

  describe("setDashboardHeaderParameterIndex", () => {
    describe("with header parameters only", () => {
      const parameters = [
        createMockParameter({ id: "1" }),
        createMockParameter({ id: "2" }),
        createMockParameter({ id: "3" }),
      ];
      const headerParameterIds = parameters.map((p) => p.id);

      it("should do nothing if the index is the same", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["1", "2", "3"]);
      });

      it("should move the first parameter to the end of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            2,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["2", "3", "1"]);
      });

      it("should move the first parameter to the middle of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            1,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["2", "1", "3"]);
      });

      it("should move the last parameter to the beginning of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "3",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["3", "1", "2"]);
      });

      it("should move the last parameter to the middle of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "3",
            1,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["1", "3", "2"]);
      });

      it("should move the middle parameter to the beginning of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "2",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["2", "1", "3"]);
      });

      it("should move the middle parameter to the end of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "2",
            2,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["1", "3", "2"]);
      });
    });

    describe("with inline parameters", () => {
      const parameters = [
        createMockParameter({ id: "1" }),
        createMockParameter({ id: "2" }),
        createMockParameter({ id: "3" }),
        createMockParameter({ id: "4" }),
        createMockParameter({ id: "5" }),
      ];
      const headerParameterIds = ["1", "3", "4"];

      it("should move a header parameter to the end", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            2,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual([
          "2",
          "3",
          "4",
          "1",
          "5",
        ]);
      });

      it("should move a header parameter to the beginning", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "4",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual([
          "4",
          "1",
          "2",
          "3",
          "5",
        ]);
      });

      it("should move a header parameter to the middle", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "4",
            1,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual([
          "1",
          "4",
          "2",
          "3",
          "5",
        ]);
      });
    });
  });
});
