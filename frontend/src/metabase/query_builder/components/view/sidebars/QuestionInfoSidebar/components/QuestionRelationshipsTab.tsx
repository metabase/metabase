import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
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

  // OSS component can't go in transforms.ts due to circular dependency via upsell analytics
  const showEnterpriseDependencies = PLUGIN_DEPENDENCIES.isEnabled;
  const showOssUpsell = !PLUGIN_DEPENDENCIES.isEnabled;

  return (
    <Stack gap="lg">
      {showEnterpriseDependencies && (
        <PLUGIN_DEPENDENCIES.QuestionDependenciesSection question={question} />
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
