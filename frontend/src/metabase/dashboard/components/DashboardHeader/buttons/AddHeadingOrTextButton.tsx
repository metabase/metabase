import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import {
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
} from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Icon, Menu, Text } from "metabase/ui";

export const AddHeadingOrTextButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

  const onAddMarkdownBox = () => {
    if (dashboard) {
      dispatch(
        addMarkdownDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  const onAddHeading = () => {
    if (dashboard) {
      dispatch(
        addHeadingDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
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
          <Menu.Item key={title} onClick={action}>
            <Text pr="xl" fw="bold">
              {title}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
