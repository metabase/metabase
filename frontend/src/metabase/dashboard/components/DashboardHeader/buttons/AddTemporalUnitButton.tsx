import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { addTemporalUnitParameter } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";

export const AddTemporalUnitButton = () => {
  const dispatch = useDispatch();
  return (
    <ToolbarButton
      tooltipLabel={t`Add a Unit of Time widget`}
      icon="clock"
      aria-label={t`Add a Unit of Time widget`}
      onClick={() => dispatch(addTemporalUnitParameter())}
    />
  );
};
