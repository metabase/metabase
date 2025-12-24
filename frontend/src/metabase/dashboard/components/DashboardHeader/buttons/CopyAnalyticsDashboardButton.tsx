import { t } from "ttag";

import Button from "metabase/common/components/Button";
import Link from "metabase/common/components/Link";
import { useLocation } from "metabase/router";

export const CopyAnalyticsDashboardButton = () => {
  const location = useLocation();
  return (
    <Button
      icon="clone"
      to={`${location.pathname}/copy`}
      as={Link}
    >{t`Make a copy`}</Button>
  );
};
