import { forwardRef } from "react";

import { getDashboardHeaderValuePopulatedParameters } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";

import {
  type DashboardParameterListProps,
  DashboardParameterList as ParameterList,
} from "../../DashboardParameterList";

export const ParametersList = forwardRef<
  HTMLDivElement,
  Omit<DashboardParameterListProps, "parameters">
>(function ParametersList(props, ref) {
  const parameters = useSelector(getDashboardHeaderValuePopulatedParameters);

  return <ParameterList ref={ref} parameters={parameters} {...props} />;
});
