import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import {
  addParameter,
  hideAddParameterPopover,
  showAddParameterPopover,
} from "metabase/dashboard/actions";
import { ParametersPopover } from "metabase/dashboard/components/ParametersPopover";
import { getIsAddParameterPopoverOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { DashboardHeaderButton } from "./DashboardHeaderButton";

export const AddFilterParameterButton = () => {
  const dispatch = useDispatch();
  const isAddParameterPopoverOpen = useSelector(getIsAddParameterPopoverOpen);

  return (
    <span>
      <TippyPopover
        placement="bottom-start"
        onClose={() => dispatch(hideAddParameterPopover())}
        visible={isAddParameterPopoverOpen}
        content={
          <ParametersPopover
            onAddParameter={parameter => dispatch(addParameter(parameter))}
            onClose={() => dispatch(hideAddParameterPopover())}
          />
        }
      >
        <div>
          <DashboardHeaderButton
            key="parameters"
            icon="filter"
            onClick={() => dispatch(showAddParameterPopover())}
            aria-label={t`Add a filter`}
            tooltipLabel={t`Add a filter`}
          />
        </div>
      </TippyPopover>
    </span>
  );
};
