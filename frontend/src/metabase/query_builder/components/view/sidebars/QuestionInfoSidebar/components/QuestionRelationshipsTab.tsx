import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ModelUsageDetails } from "./ModelUsageDetails";
import { TablesLinkedToQuestion } from "./TablesLinkedToQuestion";

export const QuestionRelationshipsTab = ({
  question,
}: {
  question: Question;
}) => {
  const isModel = question.type() === "model";

  return (
    <Stack gap="lg">
      {isModel && (
        <SidesheetCard title={t`Used by`}>
          <ModelUsageDetails model={question} />
        </SidesheetCard>
      )}
      <SidesheetCard title={t`Linked tables`}>
        <TablesLinkedToQuestion question={question} />
      </SidesheetCard>
    </Stack>
  );
};
