import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { AddFilterParameterMenu } from "metabase/dashboard/components/AddFilterParameterMenu";
import { useDashboardContext } from "metabase/dashboard/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { NewParameterOpts } from "metabase/parameters/utils/dashboards";

export const AddFilterParameterButton = () => {
  const {
    isAddParameterPopoverOpen,
    addParameter,
    hideAddParameterPopover,
    showAddParameterPopover,
  } = useDashboardContext();

  const handleAddParameter = (options: NewParameterOpts) => {
    addParameter({ options });
  };

  useRegisterShortcut(
    [
      {
        id: "dashboard-add-filter",
        perform: () =>
          isAddParameterPopoverOpen
            ? hideAddParameterPopover()
            : showAddParameterPopover(),
      },
    ],
    [isAddParameterPopoverOpen],
  );

  return (
    <AddFilterParameterMenu
      opened={isAddParameterPopoverOpen}
      position="bottom-end"
      onAdd={handleAddParameter}
      onClose={() => hideAddParameterPopover()}
    >
      <ToolbarButton
        icon="filter"
        onClick={() =>
          isAddParameterPopoverOpen
            ? hideAddParameterPopover()
            : showAddParameterPopover()
        }
        aria-label={t`Add a filter or parameter`}
        tooltipLabel={t`Add a filter or parameter`}
      />
    </AddFilterParameterMenu>
  );
};
