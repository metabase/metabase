import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { NewMetricPage } from "metabase/metrics/pages/NewMetricPage";
import { Link } from "metabase/router";
import * as Urls from "metabase/urls";

import { dataStudioMetricUrls } from "../../urls";

export function DataStudioNewMetricPage() {
  return (
    <NewMetricPage
      urls={dataStudioMetricUrls}
      showAppSwitcher
      triggeredFrom="data_studio"
      renderBreadcrumbs={() => (
        <DataStudioBreadcrumbs>
          <Link to={Urls.dataStudioLibrary()}>{t`Library`}</Link>
          {t`New Metric`}
        </DataStudioBreadcrumbs>
      )}
    />
  );
}
