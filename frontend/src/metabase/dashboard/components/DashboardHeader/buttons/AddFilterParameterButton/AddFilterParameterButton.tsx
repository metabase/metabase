import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import {
  addParameter,
  hideAddParameterPopover,
  showAddParameterPopover,
} from "metabase/dashboard/actions/parameters";
import { AddFilterParameterMenu } from "metabase/dashboard/components/AddFilterParameterMenu";
import { getIsAddParameterPopoverOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { NewParameterOpts } from "metabase/parameters/utils/dashboards";

export const AddFilterParameterButton = () => {
  const isOpened = useSelector(getIsAddParameterPopoverOpen);
  const dispatch = useDispatch();

  const handleAddParameter = (options: NewParameterOpts) => {
    dispatch(addParameter({ options }));
  };

  useRegisterShortcut(
    [
      {
        id: "dashboard-add-filter",
        perform: () =>
          isOpened
            ? dispatch(hideAddParameterPopover())
            : dispatch(showAddParameterPopover()),
      },
    ],
    [isOpened],
  );

  return (
    <AddFilterParameterMenu
      opened={isOpened}
      position="bottom-end"
      onAdd={handleAddParameter}
      onClose={() => dispatch(hideAddParameterPopover())}
    >
      <ToolbarButton
        icon="filter"
        onClick={() =>
          isOpened
            ? dispatch(hideAddParameterPopover())
            : dispatch(showAddParameterPopover())
        }
        aria-label={t`Add a filter or parameter`}
        tooltipLabel={t`Add a filter or parameter`}
      />
    </AddFilterParameterMenu>
  );
};
