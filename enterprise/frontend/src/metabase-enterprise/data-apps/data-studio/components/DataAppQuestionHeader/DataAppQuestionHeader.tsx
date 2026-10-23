import { t } from "ttag";

import type { PillTab } from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import * as Urls from "metabase/urls";
import type { Card, DataApp } from "metabase-types/api";

import { DataAppItemHeader } from "../DataAppItemHeader";

type DataAppQuestionHeaderProps = {
  app: DataApp;
  card: Card;
};

export function DataAppQuestionHeader({
  app,
  card,
}: DataAppQuestionHeaderProps) {
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioDataAppQuestion(app.name, card.id),
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioDataAppQuestionDependencies(app.name, card.id),
          },
        ]
      : []),
  ];

  return (
    <DataAppItemHeader
      app={app}
      name={card.name}
      icon="table2"
      sectionName={t`Questions`}
      sectionUrl={Urls.dataStudioDataAppQuestions(app.name)}
      tabs={tabs}
      data-testid="data-app-question-header"
    />
  );
}
