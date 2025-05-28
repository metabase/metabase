import { createMockSeries } from "metabase-types/api/mocks";

import {
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "./split-series";

describe("shouldSplitVisualizerSeries", () => {
  it.todo(
    "should return true if there're columns from more than one data source",
  );

  it.todo("should return false if all columns are from the same data source");

  it.todo("should return false if column values mappings are empty");
});

describe("splitVisualizerSeries", () => {
  it.todo("should split the series in two for two data sources");

  it.todo("should split the series in many for many data sources");

  it.todo("should skip series if their columns can't be found");

  it.todo("should use data source name as default series names");

  it.todo(
    "should use metric column name as a default series name if data source name is missing",
  );

  it.todo(
    "should use 'Series N' as a default series name if data source name is missing",
  );

  it.todo("should return the same series if there's only one data source");

  it.todo("should return the same series for non-cartesian charts");

  it.todo("should return the same series if the series is empty");

  it.todo("should return the same series if there is a series with an error");
});
