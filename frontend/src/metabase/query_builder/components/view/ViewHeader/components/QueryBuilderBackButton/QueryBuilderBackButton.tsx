import type { HTMLAttributes } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { clearBackNavigation } from "metabase/redux/entityBackButton.slice";
import { getBackDestination } from "metabase/selectors/entityBackButton";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";

import S from "./QueryBuilderBackButton.module.css";

export type QueryBuilderBackButtonProps = {
  noLink?: boolean;
  onClick?: () => void;
  destinationOverride?: {
    id: number;
    name: string;
    model: string;
  };
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

export function QueryBuidlerBackButton({
  noLink,
  onClick,
  destinationOverride,
  ...actionIconProps
}: QueryBuilderBackButtonProps) {
  const dispatch = useDispatch();
  const stateDestination = useSelector(getBackDestination);
  const destination = destinationOverride ?? stateDestination;

  const handleClick = () => {
    dispatch(clearBackNavigation());
    onClick?.();
  };

  const destinationUrl = Urls.modelToUrl(destination) ?? null;

  if (!destination || !destinationUrl) {
    return null;
  }

  const label = t`Back to ${destination.name}`;

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
        to={destinationUrl}
        {...actionIconProps}
      >
        <Icon c="brand" name="arrow_left" />
      </ActionIcon>
    </Tooltip>
  );
}
