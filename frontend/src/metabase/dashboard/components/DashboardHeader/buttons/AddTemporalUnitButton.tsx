import { t } from "ttag";

import { addTemporalUnitParameter } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";

import { DashboardHeaderButton } from "./DashboardHeaderButton";

export const AddTemporalUnitButton = () => {
  const dispatch = useDispatch();
  return (
    <DashboardHeaderButton
      tooltipLabel={t`Add a Unit of Time widget`}
      icon="clock"
      aria-label={t`Add a Unit of Time widget`}
      onClick={() => dispatch(addTemporalUnitParameter())}
    />
  );
};
