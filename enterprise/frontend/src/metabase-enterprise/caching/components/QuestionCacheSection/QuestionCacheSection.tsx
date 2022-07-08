import React from "react";
import Question from "metabase-lib/lib/Question";
import CacheSection from "../CacheSection";

interface QuestionCacheSectionProps {
  question: Question;
  onSave: (cache_ttl: number | null) => Promise<Question>;
}

const QuestionCacheSection = ({
  question,
  onSave,
}: QuestionCacheSectionProps) => {
  return <CacheSection initialCacheTTL={question.cacheTTL()} onSave={onSave} />;
};

export default QuestionCacheSection;
