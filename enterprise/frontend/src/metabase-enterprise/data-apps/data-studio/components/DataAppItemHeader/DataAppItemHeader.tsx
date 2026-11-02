import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import type { StackProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataApp, IconName } from "metabase-types/api";

type DataAppItemHeaderProps = {
  app: DataApp;
  name: string;
  icon: IconName;
  sectionName: string;
  sectionUrl: string;
  tabs: PillTab[];
} & Omit<StackProps, "title">;

export function DataAppItemHeader({
  app,
  name,
  icon,
  sectionName,
  sectionUrl,
  tabs,
  ...stackProps
}: DataAppItemHeaderProps) {
  return (
    <PaneHeader
      title={<PanelHeaderTitle>{name}</PanelHeaderTitle>}
      icon={icon}
      tabs={<PillTabNavigation tabs={tabs} />}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.dataStudioDataApps()}>{t`Data apps`}</Link>
          <Link to={Urls.dataStudioDataApp(app.name)}>{app.display_name}</Link>
          <Link to={sectionUrl}>{sectionName}</Link>
          {name}
        </DataStudioBreadcrumbs>
      }
      {...stackProps}
    />
  );
}
