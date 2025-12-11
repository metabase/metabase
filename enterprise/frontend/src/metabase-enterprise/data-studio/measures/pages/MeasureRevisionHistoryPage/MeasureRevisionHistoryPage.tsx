import { Flex, Stack } from "metabase/ui";

import { MeasureHeader } from "../../components/MeasureHeader";
import { MeasureRevisionHistory } from "../../components/MeasureRevisionHistory";
import { useExistingMeasureContext } from "../../layouts/MeasureLayout";
import { getMeasurePreviewUrl } from "../../utils/get-measure-preview-url";

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
        previewUrl={getMeasurePreviewUrl(measure)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <Stack flex={1} className={S.scrollable}>
        <MeasureRevisionHistory measure={measure} />
      </Stack>
    </Flex>
  );
}
