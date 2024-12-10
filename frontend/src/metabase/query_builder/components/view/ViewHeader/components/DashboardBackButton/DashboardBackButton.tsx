import { Link } from "react-router";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getDashboard } from "metabase/query_builder/selectors";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";

import DashboardBackButtonS from "./DashboardBackButton.module.css";

type DashboardBackButtonProps = {
  noLink?: boolean;
  onClick?: () => void;
} & ActionIconProps;

export function DashboardBackButton({
  noLink,
  onClick,
  ...actionIconProps
}: DashboardBackButtonProps) {
  const dashboard = useSelector(getDashboard);
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(navigateBackToDashboard(dashboard.id));

    onClick?.();
  };

  if (!dashboard) {
    return null;
  }

  const label = t`Back to ${dashboard.name}`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        className={DashboardBackButtonS.DashboardBackButton}
        variant="outline"
        radius="xl"
        size="2.625rem"
        color="border"
        aria-label={label}
        onClick={handleClick}
        component={noLink ? undefined : Link}
        to={Urls.dashboard(dashboard)}
        {...actionIconProps}
      >
        <Icon c="brand" name="arrow_left" />
      </ActionIcon>
    </Tooltip>
  );
}
