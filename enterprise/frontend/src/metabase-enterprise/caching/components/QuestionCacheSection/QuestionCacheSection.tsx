import { t } from "ttag";

import { getRelativeTime } from "metabase/lib/time";
import type { QuestionCacheSectionProps } from "metabase/plugins";
import { Stack, Text } from "metabase/ui";

import CacheSection from "../CacheSection";

const QuestionCacheSection = ({
  question,
  onSave,
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
        <CacheSection initialCacheTTL={question.cacheTTL()} onSave={onSave} />
      )}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionCacheSection;
