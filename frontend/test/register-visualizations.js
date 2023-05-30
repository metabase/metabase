import _ from "lodash";
import "metabase/plugins/builtin";
import { NativeQueryEditor } from "metabase/query_builder/components/NativeQueryEditor";

// We need to mock this *before* registering the visualizations. Otherwise
// `ChartWithLegend` with already load the real one.
jest.mock("metabase/components/ExplicitSize");

// We need to mock this *before* registering the visualizations.
// Otherwise ActionViz loads the NativeQueryEditor (via ActionCreator)
// and tests fail because ace is not properly mocked
jest
  .spyOn(NativeQueryEditor.prototype, "loadAceEditor")
  .mockImplementation(_.noop);

import registerVisualizations from "metabase/visualizations/register";
registerVisualizations();
