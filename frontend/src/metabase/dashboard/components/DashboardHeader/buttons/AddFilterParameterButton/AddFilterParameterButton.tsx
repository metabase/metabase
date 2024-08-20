import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import {
  hideAddParameterPopover,
  showAddParameterPopover,
} from "metabase/dashboard/actions";
import { getIsAddParameterPopoverOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getDashboardParameterSections } from "metabase/parameters/utils/dashboard-options";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Icon, Menu, Text } from "metabase/ui";

export const AddFilterParameterButton = () => {
  const sections = getDashboardParameterSections();
  const dispatch = useDispatch();
  const isAddParameterPopoverOpen = useSelector(getIsAddParameterPopoverOpen);

  return (
    <Menu
      opened={isAddParameterPopoverOpen}
      onClose={() => dispatch(hideAddParameterPopover())}
      position="bottom-end"
    >
      <Menu.Target>
        <ToolbarButton
          icon="filter"
          onClick={() =>
            isAddParameterPopoverOpen
              ? dispatch(hideAddParameterPopover())
              : dispatch(showAddParameterPopover())
          }
          aria-label={t`Add a filter or parameter`}
          tooltipLabel={t`Add a filter or parameter`}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="add-filter-parameter-dropdown">
        <Menu.Label>{t`Add a filter or parameter`}</Menu.Label>
        {sections.map(section => (
          <Menu.Item
            key={section.id}
            icon={<Icon name={getParameterIconName(section.id)} />}
            rightSection={<Text c="inherit">{section.description}</Text>}
          >
            <Text c="inherit" fw="bold">
              {section.name}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
