import Markdown from "metabase/core/components/Markdown";
import { Skeleton } from "metabase/ui/components/feedback/Skeleton/Skeleton";

import styles from "./AIAnalysisContent.module.css";

interface AIAnalysisContentProps {
  explanation: string | null;
  isLoading: boolean;
  error: string | null;
}

export function AIAnalysisContent({
  explanation,
  isLoading,
  error,
}: AIAnalysisContentProps) {
  return (
    <div className={styles.container}>
      {isLoading ? (
        <div className={styles.loaderContainer}>
          <Skeleton h="1rem" natural />
          <Skeleton h="1rem" natural />
          <Skeleton h="1rem" natural />
          <Skeleton h="1rem" natural />
          <Skeleton h="1rem" natural />
        </div>
      ) : error ? (
        <div className={styles.errorContainer}>{error}</div>
      ) : (
        <div className={styles.markdownWrapper}>
          <Markdown>{explanation || ""}</Markdown>
        </div>
      )}
    </div>
  );
}
