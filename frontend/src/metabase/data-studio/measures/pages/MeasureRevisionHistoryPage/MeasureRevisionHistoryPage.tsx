import type { ReactNode } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { Stack } from "metabase/ui";
import type { Measure } from "metabase-types/api";

import { MeasureHeader } from "../../components/MeasureHeader";
import type { MeasureTabUrls } from "../../types";

import { MeasureRevisionHistory } from "./MeasureRevisionHistory";
import S from "./MeasureRevisionHistoryPage.module.css";

type MeasureRevisionHistoryPageProps = {
  measure: Measure;
  tabUrls: MeasureTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

export function MeasureRevisionHistoryPage({
  measure,
  tabUrls,
  breadcrumbs,
  onRemove,
}: MeasureRevisionHistoryPageProps) {
  const buildQuestion = useQuestionFromOptsBuilder();
  return (
    <PageContainer data-testid="measure-revision-history-page">
      <MeasureHeader
        measure={measure}
        tabUrls={tabUrls}
        previewUrl={getDatasetQueryPreviewUrl(
          measure.definition,
          buildQuestion,
        )}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <Stack flex={1} className={S.scrollable}>
        <MeasureRevisionHistory measure={measure} />
      </Stack>
    </PageContainer>
  );
}
