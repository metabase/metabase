import { useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import {
  addParameter,
  hideAddParameterPopover,
  showAddParameterPopover,
} from "metabase/dashboard/actions";
import { getIsAddParameterPopoverOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  type ParameterSection,
  getDashboardParameterSections,
  getDefaultOptionForParameterSectionMap,
} from "metabase/parameters/utils/dashboard-options";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Icon, Menu, Text } from "metabase/ui";

export const AddFilterParameterButton = () => {
  const sections = getDashboardParameterSections();
  const dispatch = useDispatch();
  const isAddParameterPopoverOpen = useSelector(getIsAddParameterPopoverOpen);
  const [maxRightSectionWidth, setMaxRightSectionWidth] = useState(0);

  const handleItemClick = (section: ParameterSection) => {
    const defaultOption = getDefaultOptionForParameterSectionMap()[section.id];
    if (defaultOption) {
      dispatch(addParameter(defaultOption));
    }
  };

  const handleRightSectionRef = (rightSection: HTMLDivElement | null) => {
    if (rightSection) {
      setMaxRightSectionWidth(maxWidth =>
        Math.max(maxWidth, rightSection.clientWidth),
      );
    }
  };

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
            rightSection={
              <Text
                ref={handleRightSectionRef}
                c="inherit"
                miw={maxRightSectionWidth}
              >
                {section.description}
              </Text>
            }
            aria-label={section.name}
            onClick={() => handleItemClick(section)}
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
