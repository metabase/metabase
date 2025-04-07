import type { HTMLAttributes } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useTranslateContent2 } from "metabase/i18n/components/ContentTranslationContext";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getDashboard } from "metabase/query_builder/selectors";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";

import DashboardBackButtonS from "./DashboardBackButton.module.css";

export type DashboardBackButtonProps = {
  noLink?: boolean;
  onClick?: () => void;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

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

  const tc = useTranslateContent2();

  if (!dashboard) {
    return null;
  }

  const label = t`Back to ${tc(dashboard.name)}`;

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
