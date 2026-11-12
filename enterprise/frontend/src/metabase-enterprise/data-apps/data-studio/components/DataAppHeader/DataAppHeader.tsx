import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { PillTabNavigation } from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";
import type { DataApp } from "metabase-types/api";

import { DataAppMoreMenu } from "../DataAppMoreMenu";

type DataAppHeaderProps = {
  app: DataApp;
};

export function DataAppHeader({ app }: DataAppHeaderProps) {
  return (
    <PaneHeader
      title={<PanelHeaderTitle>{app.name}</PanelHeaderTitle>}
      menu={<DataAppMoreMenu app={app} />}
      tabs={
        <PillTabNavigation
          tabs={[
            { label: t`Overview`, to: Urls.dataStudioDataApp(app.slug) },
            {
              label: t`Questions`,
              to: Urls.dataStudioDataAppQuestions(app.slug),
            },
            { label: t`Actions`, to: Urls.dataStudioDataAppActions(app.slug) },
            {
              label: t`Permissions`,
              to: Urls.dataStudioDataAppPermissions(app.slug),
            },
          ]}
        />
      }
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.dataStudioDataApps()}>{t`Data apps`}</Link>
          {app.name}
        </DataStudioBreadcrumbs>
      }
      data-testid="data-app-header"
    />
  );
}
