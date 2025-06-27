import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { Group, Icon, Menu } from "metabase/ui";

export const AddHeadingOrTextButton = () => {
  const {
    dashboard,
    selectedTabId,
    addHeadingDashCardToDashboard,
    addMarkdownDashCardToDashboard,
  } = useDashboardContext();

  const onAddMarkdownBox = () => {
    if (dashboard) {
      addMarkdownDashCardToDashboard({
        dashId: dashboard.id,
        tabId: selectedTabId,
      });
    }
  };

  const onAddHeading = () => {
    if (dashboard) {
      addHeadingDashCardToDashboard({
        dashId: dashboard.id,
        tabId: selectedTabId,
      });
    }
  };

  const TEXT_OPTIONS = [
    {
      title: t`Heading`,
      action: onAddHeading,
    },
    {
      title: t`Text`,
      action: onAddMarkdownBox,
    },
  ];

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ToolbarButton
          tooltipLabel={t`Add a heading or text`}
          w="3rem"
          data-element-id={t`Add a heading or text`}
          aria-label={t`Add a heading or text box`}
        >
          <Group gap="xs" wrap="nowrap">
            <Icon name="string" size={18} />
            <Icon name="chevrondown" size={10} />
          </Group>
        </ToolbarButton>
      </Menu.Target>
      <Menu.Dropdown miw="auto">
        {TEXT_OPTIONS.map(({ title, action }) => (
          <Menu.Item key={title} pr="xl" fw="bold" onClick={action}>
            {title}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
