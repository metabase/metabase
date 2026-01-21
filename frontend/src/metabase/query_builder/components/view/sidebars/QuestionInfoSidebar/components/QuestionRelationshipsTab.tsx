import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_DATA_STUDIO, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ModelUsageDetails } from "./ModelUsageDetails";
import { QuestionDependenciesSection } from "./QuestionDependenciesSection";
import { TablesLinkedToQuestion } from "./TablesLinkedToQuestion";

export const QuestionRelationshipsTab = ({
  question,
}: {
  question: Question;
}) => {
  const isModel = question.type() === "model";
  const canAccessDataStudio = useSelector(
    PLUGIN_DATA_STUDIO.canAccessDataStudio,
  );

  // OSS component can't go in transforms.ts due to circular dependency via upsell analytics
  // Enterprise users need Data Studio access to view the dependency graph
  const showEnterpriseDependencies =
    PLUGIN_DEPENDENCIES.isEnabled && canAccessDataStudio;
  const showOssUpsell = !PLUGIN_DEPENDENCIES.isEnabled;

  return (
    <Stack gap="lg">
      {showEnterpriseDependencies && (
        <SidesheetCard title={t`Dependencies`}>
          <PLUGIN_DEPENDENCIES.QuestionDependenciesSection
            question={question}
          />
        </SidesheetCard>
      )}
      {showOssUpsell && <QuestionDependenciesSection question={question} />}
      {isModel && (
        <SidesheetCard title={t`Used by`}>
          <ModelUsageDetails model={question} />
        </SidesheetCard>
      )}
      <SidesheetCard title={t`Linked tables`}>
        <TablesLinkedToQuestion />
      </SidesheetCard>
    </Stack>
  );
};
