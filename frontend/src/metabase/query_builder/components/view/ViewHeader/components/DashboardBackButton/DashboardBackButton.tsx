import { t } from "ttag";

import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import {
  BackButton,
  BackButtonContainer,
} from "metabase/query_builder/components/view/ViewHeader/ViewHeader.styled";
import { getDashboard } from "metabase/query_builder/selectors";

export function DashboardBackButton() {
  const dashboard = useSelector(getDashboard);
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(navigateBackToDashboard(dashboard.id));
  };

  if (!dashboard) {
    return null;
  }

  const label = t`Back to ${dashboard.name}`;

  return (
    <Tooltip tooltip={label}>
      <BackButtonContainer>
        <BackButton
          as={Link}
          to={Urls.dashboard(dashboard)}
          round
          icon="arrow_left"
          aria-label={label}
          onClick={handleClick}
        />
      </BackButtonContainer>
    </Tooltip>
  );
}
