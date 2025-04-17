import Markdown from "metabase/core/components/Markdown";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { Skeleton } from "metabase/ui/components/feedback/Skeleton/Skeleton";

import S from "./AIAnalysisContent.module.css";

interface AIAnalysisContentProps {
  explanation?: string;
}

export function AIAnalysisContent({ explanation }: AIAnalysisContentProps) {
  return (
    <div>
      {explanation == null ? (
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
