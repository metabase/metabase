import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { useCompatLocation } from "metabase/routing/compat";

export const CopyAnalyticsDashboardButton = () => {
  const location = useCompatLocation();

  return (
    <Button
      icon="clone"
      to={`${location.pathname}/copy`}
      as={Link}
    >{t`Make a copy`}</Button>
  );
};
