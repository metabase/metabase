import { t } from "ttag";

import {
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
} from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Icon, Menu, Text } from "metabase/ui";

import { DashboardHeaderButton } from "../DashboardHeaderButton";

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

  // TODO: from Oisin - I don't think event is used in EntityMenu.
  const TEXT_OPTIONS = [
    {
      title: t`Heading`,
      action: onAddHeading,
      // event: "Dashboard; Add Heading",
    },
    {
      title: t`Text`,
      action: onAddMarkdownBox,
      // event: "Dashboard; Add Markdown Box",
    },
  ];

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <DashboardHeaderButton
          tooltipLabel={t`Add a heading or text box`}
          w="3rem"
          aria-label={t`Add a heading or text box`}
        >
          <Group spacing="xs">
            <Icon name="string" size={18} />
            <Icon name="chevrondown" size={10} />
          </Group>
        </DashboardHeaderButton>
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
