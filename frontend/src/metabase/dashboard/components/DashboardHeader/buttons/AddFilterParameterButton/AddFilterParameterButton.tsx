import { useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import {
  type ParameterSection,
  getDashboardParameterSections,
  getDefaultOptionForParameterSectionMap,
} from "metabase/parameters/utils/dashboard-options";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Icon, Menu, Text } from "metabase/ui";

export const AddFilterParameterButton = () => {
  const sections = getDashboardParameterSections();
  const {
    isAddParameterPopoverOpen,
    addParameter,
    hideAddParameterPopover,
    showAddParameterPopover,
  } = useDashboardContext();
  const [rightSectionWidth, setRightSectionWidth] = useState(0);
  const rightSectionWidthRef = useRef(0);

  const handleItemClick = (section: ParameterSection) => {
    const defaultOption = getDefaultOptionForParameterSectionMap()[section.id];
    if (defaultOption) {
      addParameter(defaultOption);
    }
  };

  const handleRightSectionRef = (rightSection: HTMLDivElement | null) => {
    if (rightSection) {
      rightSectionWidthRef.current = Math.max(
        rightSectionWidthRef.current,
        rightSection.clientWidth,
      );
    }
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

  useLayoutEffect(() => {
    if (isAddParameterPopoverOpen) {
      setRightSectionWidth(rightSectionWidthRef.current);
    }
  }, [isAddParameterPopoverOpen]);

  return (
    <Menu
      opened={isAddParameterPopoverOpen}
      onClose={() => hideAddParameterPopover()}
      position="bottom-end"
      trapFocus
    >
      <Menu.Target>
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
      </Menu.Target>
      <Menu.Dropdown data-testid="add-filter-parameter-dropdown">
        <Menu.Label>{t`Add a filter or parameter`}</Menu.Label>
        {sections.map((section) => (
          <Menu.Item
            key={section.id}
            leftSection={<Icon name={getParameterIconName(section.id)} />}
            rightSection={
              <Text
                ref={handleRightSectionRef}
                c="inherit"
                miw={rightSectionWidth}
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
