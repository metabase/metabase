import "metabase/plugins/builtin";
// We need to mock this *before* registering the visualizations. Otherwise
// `ChartWithLegend` with already load the real one.
jest.mock("metabase/components/ExplicitSize");

import registerVisualizations from "metabase/visualizations/register";
registerVisualizations();
