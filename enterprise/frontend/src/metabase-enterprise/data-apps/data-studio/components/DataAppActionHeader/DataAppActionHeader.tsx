import { t } from "ttag";

import type { PillTab } from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import type { StackProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataApp, WritebackQueryAction } from "metabase-types/api";

import { DataAppItemHeader } from "../DataAppItemHeader";

type DataAppActionHeaderProps = {
  app: DataApp;
  action: WritebackQueryAction;
} & Omit<StackProps, "title">;

export function DataAppActionHeader({
  app,
  action,
  ...stackProps
}: DataAppActionHeaderProps) {
  const fieldsUrl = Urls.dataStudioDataAppActionFields(app.name, action.id);
  const tabs: PillTab[] = [
    {
      label: t`Definition`,
      to: Urls.dataStudioDataAppAction(app.name, action.id),
    },
    {
      label: t`Fields`,
      to: fieldsUrl,
      isSelected: (pathname: string) => pathname.startsWith(fieldsUrl),
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioDataAppActionDependencies(app.name, action.id),
          },
        ]
      : []),
  ];

  return (
    <DataAppItemHeader
      app={app}
      name={action.name}
      icon="bolt"
      sectionName={t`Actions`}
      sectionUrl={Urls.dataStudioDataAppActions(app.name)}
      tabs={tabs}
      data-testid="data-app-action-header"
      {...stackProps}
    />
  );
}
