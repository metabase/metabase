// We need to mock this *before* registering the visualizations. Otherwise
// `ChartWithLegend` with already load the real one.
jest.mock("metabase/common/components/ExplicitSize", () =>
  require("metabase/common/components/ExplicitSize/__mocks__/ExplicitSize"),
);

// We need to mock this *before* registering the visualizations.
// Otherwise ActionViz loads the NativeQueryEditor (via ActionCreator)
// and tests fail because ace is not properly mocked
jest.mock("metabase/query_builder/components/NativeQueryEditor", () =>
  require("metabase/query_builder/components/NativeQueryEditor/__mocks__/NativeQueryEditor"),
);
