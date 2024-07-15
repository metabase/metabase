import { t } from "ttag";

import { addTemporalUnitParameter } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { useDispatch } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui";

export const AddTemporalUnitButton = () => {
  const dispatch = useDispatch();
  return (
    <Tooltip label={t`Add a Unit of Time widget`}>
      <DashboardHeaderButton
        icon="clock"
        aria-label={t`Add a Unit of Time widget`}
        onClick={() => dispatch(addTemporalUnitParameter())}
      />
    </Tooltip>
  );
};
