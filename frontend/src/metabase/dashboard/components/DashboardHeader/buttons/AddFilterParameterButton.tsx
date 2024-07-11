import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import {
  addParameter,
  hideAddParameterPopover,
  showAddParameterPopover,
} from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { ParametersPopover } from "metabase/dashboard/components/ParametersPopover";
import { getIsAddParameterPopoverOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui";

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
          <Tooltip label={t`Add a filter`}>
            <DashboardHeaderButton
              icon="filter"
              onClick={() => dispatch(showAddParameterPopover())}
              aria-label={t`Add a filter`}
            />
          </Tooltip>
        </div>
      </TippyPopover>
    </span>
  );
};
