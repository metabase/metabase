import type { ReactNode } from "react";

import { Flex, Stack } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import type { Measure } from "metabase-types/api";

import { MeasureHeader } from "../../components/MeasureHeader";
import { MeasureRevisionHistory } from "../../components/MeasureRevisionHistory";
import type { MeasureTabUrls } from "../../types";

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
  return (
    <Flex
      direction="column"
      h="100%"
      data-testid="measure-revision-history-page"
    >
      <MeasureHeader
        measure={measure}
        tabUrls={tabUrls}
        previewUrl={getDatasetQueryPreviewUrl(measure.definition)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <Stack flex={1} className={S.scrollable}>
        <MeasureRevisionHistory measure={measure} />
      </Stack>
    </Flex>
  );
}
