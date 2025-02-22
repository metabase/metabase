import { type JSX, type MouseEvent, forwardRef, useState } from "react";
import { Link, type LinkProps, withRouter } from "react-router";
import type { WithRouterProps } from "react-router/lib/withRouter";
import { c, t } from "ttag";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import type { HeaderButtonProps } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import { useRefreshDashboard } from "metabase/dashboard/hooks";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import { useRegisterActions } from "kbar";
import { useDispatch } from "metabase/lib/redux";
import { push } from "react-router-redux";

// Fixes this bug: https://github.com/mantinedev/mantine/issues/5571#issue-2082430353
// Hover states get weird when using Link directly. Since Link does not take the standard
// `ref` prop, we have to manually forward it to the correct prop name to make hover work as expected.
const ForwardRefLink = forwardRef((props: LinkProps, ref) => (
  // @ts-expect-error - innerRef not in prop types but it is a valid prop. docs can be found here: https://github.com/remix-run/react-router/blob/v3.2.6/docs/API.md#innerref
  <Link {...props} innerRef={ref} />
));
// @ts-expect-error - must set a displayName + this works
ForwardRefLink.displayName = "ForwardRefLink";

const DashboardActionMenuInner = ({
  canResetFilters,
  onResetFilters,
  onFullscreenChange,
  isFullscreen,
  dashboard,
  canEdit,
  location,
  openSettingsSidebar,
}: HeaderButtonProps & WithRouterProps): JSX.Element => {
  const dispatch = useDispatch();
  const [opened, setOpened] = useState(false);

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId: dashboard.id,
    parameterQueryParams: location.query,
    refetchData: false,
  });

  const moderationItems = PLUGIN_MODERATION.useDashboardMenuItems(
    dashboard,
    refreshDashboard,
  );

  useRegisterActions(
    [
      {
        name: "Copy dashboard",
        id: "copy-dashboard",
        shortcut: ["$mod+c"],
        perform: () => dispatch(push(`${location?.pathname}/copy`)),
      },
      {
        name: "Move dashboard",
        id: "move-dashboard",
        shortcut: ["$mod+m"],
        perform: () => canEdit && dispatch(push(`${location?.pathname}/move`)),
      },
      {
        name: "Send tashboard to trash",
        id: "trash-dashboard",
        shortcut: ["$mod+backspace"],
        perform: () => dispatch(push(`${location?.pathname}/archive`)),
      },
    ],
    [location.pathname],
  );

  return (
    <Menu position="bottom-end" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <div>
          <Tooltip tooltip={t`Move, trash, and more…`} isEnabled={!opened}>
            <Button
              onlyIcon
              icon="ellipsis"
              aria-label={t`Move, trash, and more…`}
            />
          </Tooltip>
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        {canResetFilters && (
          <Menu.Item
            leftSection={<Icon name="revert" />}
            onClick={onResetFilters}
          >
            {t`Reset all filters`}
          </Menu.Item>
        )}

        <Menu.Item
          leftSection={<Icon name="expand" />}
          onClick={(e: MouseEvent) =>
            onFullscreenChange(!isFullscreen, !e.altKey)
          }
        >
          {t`Enter fullscreen`}
        </Menu.Item>

        {canEdit && (
          <>
            <Menu.Item
              leftSection={<Icon name="gear" />}
              onClick={openSettingsSidebar}
            >
              {t`Edit settings`}
            </Menu.Item>

            {moderationItems}
          </>
        )}

        {canEdit && (
          <>
            <Menu.Divider />

            <Menu.Item
              leftSection={<Icon name="move" />}
              component={ForwardRefLink}
              to={`${location?.pathname}/move`}
            >{c("A verb, not a noun").t`Move`}</Menu.Item>
          </>
        )}

        <Menu.Item
          leftSection={<Icon name="clone" />}
          component={ForwardRefLink}
          to={`${location?.pathname}/copy`}
        >{c("A verb, not a noun").t`Duplicate`}</Menu.Item>

        {canEdit && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="trash" />}
              component={ForwardRefLink}
              to={`${location?.pathname}/archive`}
            >{t`Move to trash`}</Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

export const DashboardActionMenu = withRouter(DashboardActionMenuInner);
