import { createMockCollection } from "metabase-types/api/mocks";

import { createMockMetricResult } from "./test-utils";
import type { MetricResult } from "./types";
import { sortMetrics } from "./utils";

describe("sortMetrics", () => {
  let id = 0;
  const metricMap: Record<string, MetricResult> = {
    "model named A, with collection path X / Y / Z": createMockMetricResult({
      id: id++,
      name: "A",
      collection: createMockCollection({
        name: "Z",
        effective_ancestors: [
          createMockCollection({ name: "X" }),
          createMockCollection({ name: "Y" }),
        ],
      }),
    }),
    "model named C, with collection path Y": createMockMetricResult({
      id: id++,
      name: "C",
      collection: createMockCollection({ name: "Y" }),
    }),
    "model named B, with collection path D / E / F": createMockMetricResult({
      id: id++,
      name: "B",
      collection: createMockCollection({
        name: "F",
        effective_ancestors: [
          createMockCollection({ name: "D" }),
          createMockCollection({ name: "E" }),
        ],
      }),
    }),
  };
  const mockSearchResults = Object.values(metricMap);

  it("can sort by name in ascending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: "asc",
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map((model) => model.name)).toEqual(["A", "B", "C"]);
  });

  it("can sort by name in descending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: "desc",
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map((model) => model.name)).toEqual(["C", "B", "A"]);
  });

  it("can sort by collection path in ascending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: "asc",
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map((model) => model.name)).toEqual(["B", "A", "C"]);
  });

  it("can sort by collection path in descending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: "desc",
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map((model) => model.name)).toEqual(["C", "A", "B"]);
  });

  describe("secondary sort", () => {
    metricMap["model named C, with collection path Z"] = createMockMetricResult(
      {
        name: "C",
        collection: createMockCollection({ name: "Z" }),
      },
    );
    metricMap["model named Bz, with collection path D / E / F"] =
      createMockMetricResult({
        name: "Bz",
        collection: createMockCollection({
          name: "F",
          effective_ancestors: [
            createMockCollection({ name: "D" }),
            createMockCollection({ name: "E" }),
          ],
        }),
      });
    const mockSearchResults = Object.values(metricMap);

    it("can sort by collection path, ascending, and then does a secondary sort by name", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: "asc",
      } as const;
      const sorted = sortMetrics(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        metricMap["model named B, with collection path D / E / F"],
        metricMap["model named Bz, with collection path D / E / F"],
        metricMap["model named A, with collection path X / Y / Z"],
        metricMap["model named C, with collection path Y"],
        metricMap["model named C, with collection path Z"],
      ]);
    });

    it("can sort by collection path, descending, and then does a secondary sort by name", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: "desc",
      } as const;
      const sorted = sortMetrics(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        metricMap["model named C, with collection path Z"],
        metricMap["model named C, with collection path Y"],
        metricMap["model named A, with collection path X / Y / Z"],
        metricMap["model named Bz, with collection path D / E / F"],
        metricMap["model named B, with collection path D / E / F"],
      ]);
    });
  });
});
