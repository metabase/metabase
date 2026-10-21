import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
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
      title={<PanelHeaderTitle>{app.display_name}</PanelHeaderTitle>}
      menu={<DataAppMoreMenu app={app} />}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.dataStudioDataApps()}>{t`Data apps`}</Link>
          {app.display_name}
        </DataStudioBreadcrumbs>
      }
      data-testid="data-app-header"
    />
  );
}
