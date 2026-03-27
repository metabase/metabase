import type { Location } from "history";
import { Link, type Route } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { NewMetricPage } from "metabase/metrics/pages/NewMetricPage";
import * as Urls from "metabase/utils/urls";

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
