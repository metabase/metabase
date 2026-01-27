import { type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";

export const CopyAnalyticsDashboardButton = withRouter(
  ({ location }: WithRouterProps) => (
    <Button
      icon="clone"
      to={`${location.pathname}/copy`}
      as={Link}
    >{t`Make a copy`}</Button>
  ),
);
