import { getDashboardHeaderValuePopulatedParameters } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";

import {
  type DashboardParameterListProps,
  DashboardParameterList as ParameterList,
} from "../../DashboardParameterList";

export function ParametersList(
  props: Omit<DashboardParameterListProps, "parameters">,
) {
  const parameters = useSelector(getDashboardHeaderValuePopulatedParameters);

  return <ParameterList parameters={parameters} {...props} />;
}
