import { type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

export const CopyAnalyticsDashboardButton = withRouter(
  ({ location }: WithRouterProps) => (
    <Button
      icon="clone"
      to={`${location.pathname}/copy`}
      as={Link}
    >{t`Make a copy`}</Button>
  ),
);
