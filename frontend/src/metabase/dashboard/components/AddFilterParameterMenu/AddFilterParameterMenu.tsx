import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import {
  type ParameterSection,
  getDashboardParameterSections,
  getDefaultOptionForParameterSectionMap,
} from "metabase/parameters/utils/dashboard-options";
import type { NewParameterOpts } from "metabase/parameters/utils/dashboards";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Icon, Menu, type MenuProps, Text } from "metabase/ui";

interface AddFilterParameterMenuProps extends MenuProps {
  children: ReactNode; // trigger content
  onAdd: (options: NewParameterOpts) => void;
}

export const AddFilterParameterMenu = ({
  opened,
  children,
  onAdd,
  ...menuProps
}: AddFilterParameterMenuProps) => {
  const sections = getDashboardParameterSections();
  const [rightSectionWidth, setRightSectionWidth] = useState(0);
  const rightSectionWidthRef = useRef(0);

  const handleItemClick = (section: ParameterSection) => {
    const defaultOption = getDefaultOptionForParameterSectionMap()[section.id];
    if (defaultOption) {
      onAdd({
        name: defaultOption.combinedName || defaultOption.name,
        type: defaultOption.type,
        sectionId: defaultOption.sectionId,
      });
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

  useLayoutEffect(() => {
    if (opened) {
      setRightSectionWidth(rightSectionWidthRef.current);
    }
  }, [opened]);

  return (
    <Menu opened={opened} trapFocus {...menuProps}>
      <Menu.Target>{children}</Menu.Target>
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
