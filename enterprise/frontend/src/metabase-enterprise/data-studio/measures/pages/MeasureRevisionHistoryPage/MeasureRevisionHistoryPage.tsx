import { Flex, Stack } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";

import { MeasureHeader } from "../../components/MeasureHeader";
import { MeasureRevisionHistory } from "../../components/MeasureRevisionHistory";
import { useExistingMeasureContext } from "../../layouts/MeasureLayout";

import S from "./MeasureRevisionHistoryPage.module.css";

export function MeasureRevisionHistoryPage() {
  const { measure, tabUrls, breadcrumbs, onRemove } =
    useExistingMeasureContext();

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
