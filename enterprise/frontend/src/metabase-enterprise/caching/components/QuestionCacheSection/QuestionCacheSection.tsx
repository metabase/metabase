import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";

import { getRelativeTime } from "metabase/lib/time";
import { Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { SidebarCacheSection } from "../SidebarCacheSection";

export interface QuestionCacheSectionProps {
  question: Question;
  setPage: Dispatch<SetStateAction<"default" | "caching">>;
}

const QuestionCacheSection = ({
  question,
  setPage,
}: QuestionCacheSectionProps) => {
  const canWrite = question.canWrite();
  const cacheTimestamp = question.lastQueryStart();
  const cacheRelativeTime = cacheTimestamp && getRelativeTime(cacheTimestamp);

  return (
    <Stack spacing="0.5rem">
      {cacheTimestamp && (
        <Text color="text-dark" fw="bold">
          {t`Question last cached ${cacheRelativeTime}`}
        </Text>
      )}
      {canWrite && (
        <SidebarCacheSection
          model="question"
          item={question}
          setPage={setPage}
        />
      )}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionCacheSection;
