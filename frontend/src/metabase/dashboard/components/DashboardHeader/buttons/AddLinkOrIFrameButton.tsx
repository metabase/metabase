import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import {
  addIFrameDashCardToDashboard,
  addLinkDashCardToDashboard,
} from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Icon, Menu, Text } from "metabase/ui";

export const AddLinkOrIFrameButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

  const onAddLinkCard = () => {
    if (dashboard) {
      dispatch(
        addLinkDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  const onAddIFrameCard = () => {
    if (dashboard) {
      dispatch(
        addIFrameDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  const TEXT_OPTIONS = [
    {
      title: t`Link`,
      action: onAddLinkCard,
    },
    {
      title: t`IFrame`,
      action: onAddIFrameCard,
    },
  ];

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ToolbarButton
          tooltipLabel={t`Add a link or iframe`}
          w="3rem"
          data-element-id={t`Add a link or iframe`}
          aria-label={t`Add a link or iframe`}
        >
          <Group spacing="xs" noWrap>
            <Icon name="link" size={18} />
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
