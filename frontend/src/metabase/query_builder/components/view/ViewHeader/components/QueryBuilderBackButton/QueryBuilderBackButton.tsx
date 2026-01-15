import type { HTMLAttributes } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getParentEntity } from "metabase/query_builder/selectors";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import type { CollectionItemModel, DashboardId } from "metabase-types/api";

import S from "./QueryBuilderBackButton.module.css";

export type QueryBuilderBackButtonProps = {
  noLink?: boolean;
  onClick?: () => void;
  parentOverride?: {
    id: DashboardId | number;
    model: CollectionItemModel;
    name: string;
  };
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

export function QueryBuilderBackButton({
  noLink,
  onClick,
  parentOverride,
  ...actionIconProps
}: QueryBuilderBackButtonProps) {
  const stateParent = useSelector(getParentEntity);
  const parent = parentOverride ?? stateParent;
  const dispatch = useDispatch();
  const tc = useTranslateContent();

  const handleClick = () => {
    if (parent.model === "dashboard") {
      dispatch(navigateBackToDashboard(parent.id));
    }
    onClick?.();
  };

  const url = Urls.modelToUrl(parent);

  if (!parent.model || !url) {
    return null;
  }

  const label = t`Back to ${tc(parent.name)}`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        className={S.QueryBuilderBackButton}
        variant="outline"
        radius="xl"
        size="2.625rem"
        color="border"
        aria-label={label}
        onClick={handleClick}
        component={noLink ? undefined : Link}
        to={url}
        {...actionIconProps}
      >
        <Icon c="brand" name="arrow_left" />
      </ActionIcon>
    </Tooltip>
  );
}
