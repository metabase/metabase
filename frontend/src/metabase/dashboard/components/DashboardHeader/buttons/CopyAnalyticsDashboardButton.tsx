import { type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Button, Icon } from "metabase/ui";

export const CopyAnalyticsDashboardButton = withRouter(
  ({ location }: WithRouterProps) => (
    <Button
      leftSection={<Icon name="clone" />}
      to={`${location.pathname}/copy`}
      component={Link}
    >{t`Make a copy`}</Button>
  ),
);
