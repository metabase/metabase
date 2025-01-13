import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { Box, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ModelUsageDetails } from "./ModelUsageDetails";
import { QuestionSourceTables } from "./QuestionSourceTables";

export const QuestionRelationshipsTab = ({
  question,
}: {
  question: Question;
}) => {
  const isModel = question.type() === "model";

  return (
    <Stack spacing="lg">
      {isModel && (
        <SidesheetCard title={<Box pb="sm">{t`Used by`}</Box>}>
          <ModelUsageDetails model={question} />
        </SidesheetCard>
      )}
      <SidesheetCard title={t`Parent tables`}>
        <QuestionSourceTables />
      </SidesheetCard>
    </Stack>
  );
};
