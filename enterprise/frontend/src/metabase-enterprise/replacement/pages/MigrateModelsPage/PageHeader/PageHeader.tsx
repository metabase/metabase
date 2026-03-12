import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";

export function PageHeader() {
  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
      }
      py={0}
    />
  );
}
