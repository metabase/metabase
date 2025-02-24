import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import {
  addIFrameDashCardToDashboard,
  addLinkDashCardToDashboard,
} from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Icon, Menu } from "metabase/ui";

export const AddLinkOrEmbedButton = () => {
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

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ToolbarButton
          tooltipLabel={t`Add a link or iframe`}
          w="3rem"
          data-element-id={t`Add a link or iframe`}
          aria-label={t`Add a link or iframe`}
        >
          <Group gap="xs" wrap="nowrap">
            <Icon name="link" size={18} />
            <Icon name="chevrondown" size={10} />
          </Group>
        </ToolbarButton>
      </Menu.Target>
      <Menu.Dropdown miw="auto">
        <Menu.Item pr="xl" fw="bold" onClick={onAddLinkCard}>
          {t`Link`}
        </Menu.Item>
        <Menu.Item pr="xl" fw="bold" onClick={onAddIFrameCard}>
          {t`Iframe`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
