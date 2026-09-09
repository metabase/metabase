import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { useWorktreeId } from "metabase/common/worktrees";
import { NewMetricPage } from "metabase/metrics/pages/NewMetricPage";
import * as Urls from "metabase/urls";

import { useDataStudioMetricUrls } from "../../urls";

export function DataStudioNewMetricPage() {
  const worktreeId = useWorktreeId();
  const urls = useDataStudioMetricUrls();
  return (
    <NewMetricPage
      urls={urls}
      showAppSwitcher
      triggeredFrom="data_studio"
      renderBreadcrumbs={() => (
        <DataStudioBreadcrumbs>
          <Link to={Urls.dataStudioLibrary({ worktreeId })}>{t`Library`}</Link>
          {t`New Metric`}
        </DataStudioBreadcrumbs>
      )}
    />
  );
}
