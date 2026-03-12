import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/lib/urls";

export function PageHeader() {
  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.transformList()}>{t`Transforms`}</Link>
          {t`Migrate models`}
        </DataStudioBreadcrumbs>
      }
      py={0}
    />
  );
}
