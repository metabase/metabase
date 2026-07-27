import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useRouter } from "metabase/router";
import { Button, Icon } from "metabase/ui";

export const CopyAnalyticsDashboardButton = () => {
  const { location } = useRouter();

  return (
    <Button
      leftSection={<Icon name="clone" />}
      to={`${location.pathname}/copy`}
      component={Link}
    >{t`Make a copy`}</Button>
  );
};
