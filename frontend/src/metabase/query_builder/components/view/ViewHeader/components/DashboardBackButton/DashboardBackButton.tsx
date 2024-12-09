import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getDashboard } from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

type DashboardBackButtonProps = {
  noLink?: boolean;
  onClick?: () => void;
};

export function DashboardBackButton({
  noLink,
  onClick,
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
    <Tooltip tooltip={label}>
      <Box mr="0.75rem" component="span">
        <Button
          className={ViewTitleHeaderS.backButton}
          {...(noLink
            ? {}
            : {
                as: Link,
                to: Urls.dashboard(dashboard),
              })}
          round
          icon="arrow_left"
          aria-label={label}
          onClick={handleClick}
        />
      </Box>
    </Tooltip>
  );
}
