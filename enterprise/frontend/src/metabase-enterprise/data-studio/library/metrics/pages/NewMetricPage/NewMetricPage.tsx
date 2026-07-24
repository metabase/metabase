import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { NewMetricPage } from "metabase/metrics/pages/NewMetricPage";
import type { Location, Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { dataStudioMetricUrls } from "../../urls";

interface NewMetricPageQuery {
  collectionId?: string;
}

interface DataStudioNewMetricPageProps {
  location: Location<NewMetricPageQuery>;
  route: Route;
}

export function DataStudioNewMetricPage({
  location,
  route,
}: DataStudioNewMetricPageProps) {
  return (
    <NewMetricPage
      location={location}
      route={route}
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
