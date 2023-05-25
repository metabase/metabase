import React from "react";
import { t } from "ttag";
import { getRelativeTime } from "metabase/lib/time";
import Question from "metabase-lib/Question";
import CacheSection from "../CacheSection";
import { QueryStartLabel } from "./QuestionCacheSection.styled";

export interface QuestionCacheSectionProps {
  question: Question;
  onSave: (cache_ttl: number | null) => Promise<Question>;
}

const QuestionCacheSection = ({
  question,
  onSave,
}: QuestionCacheSectionProps) => {
  const cacheTimestamp = question.lastQueryStart();
  const cacheRelativeTime = cacheTimestamp && getRelativeTime(cacheTimestamp);

  return (
    <div>
      {cacheTimestamp && (
        <QueryStartLabel>
          {t`Question last cached ${cacheRelativeTime}`}
        </QueryStartLabel>
      )}
      <CacheSection initialCacheTTL={question.cacheTTL()} onSave={onSave} />
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionCacheSection;
