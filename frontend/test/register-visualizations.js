// We need to mock this *before* registering the visualizations. Otherwise
// `ChartWithLegend` with already load the real one.
jest.mock("metabase/components/ExplicitSize");

// We need to mock this *before* registering the visualizations.
// Otherwise ActionViz loads the NativeQueryEditor (via ActionCreator)
// and tests fail because ace is not properly mocked
jest.mock("metabase/query_builder/components/NativeQueryEditor");
