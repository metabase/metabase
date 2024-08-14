import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import {
  addParameter,
  hideAddParameterPopover,
  showAddParameterPopover,
} from "metabase/dashboard/actions";
import { ParametersPopover } from "metabase/dashboard/components/ParametersPopover";
import { getIsAddParameterPopoverOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Popover } from "metabase/ui";

export const AddFilterParameterButton = () => {
  const dispatch = useDispatch();
  const isAddParameterPopoverOpen = useSelector(getIsAddParameterPopoverOpen);

  return (
    <Popover
      opened={isAddParameterPopoverOpen}
      onClose={() => dispatch(hideAddParameterPopover())}
      position="bottom-end"
    >
      <Popover.Target>
        <ToolbarButton
          icon="filter"
          onClick={() =>
            isAddParameterPopoverOpen
              ? dispatch(hideAddParameterPopover())
              : dispatch(showAddParameterPopover())
          }
          aria-label={t`Add a filter`}
          tooltipLabel={t`Add a filter`}
        />
      </Popover.Target>
      <Popover.Dropdown data-testid="add-filter-parameter-dropdown">
        <ParametersPopover
          onAddParameter={parameter => dispatch(addParameter(parameter))}
          onClose={() => dispatch(hideAddParameterPopover())}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
