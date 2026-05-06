import { Markdown } from "metabase/common/components/Markdown";
import { Repeat, Skeleton } from "metabase/ui";

import S from "./AIAnalysisContent.module.css";

export interface AIAnalysisContentProps {
  explanation?: string;
  isLoading?: boolean;
}

export function AIAnalysisContent({
  explanation,
  isLoading,
}: AIAnalysisContentProps) {
  const shouldShowLoading = isLoading || explanation == null;

  return (
    <div>
      {shouldShowLoading ? (
        <Repeat times={8}>
          <Skeleton h="1rem" natural mb="0.5rem" />
        </Repeat>
      ) : (
        <div className={S.analysisWrapper}>
          <Markdown>{explanation}</Markdown>
        </div>
      )}
    </div>
  );
}
