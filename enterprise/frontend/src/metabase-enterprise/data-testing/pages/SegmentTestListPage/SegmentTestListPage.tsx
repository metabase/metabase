import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import {
  DataModelSegmentBreadcrumbs,
  PublishedTableSegmentBreadcrumbs,
} from "metabase/data-studio/segments/components/SegmentBreadcrumbs";
import { SegmentHeader } from "metabase/data-studio/segments/components/SegmentHeader";
import { useDataModelSegmentPage } from "metabase/data-studio/segments/hooks/use-data-model-segment-page";
import { usePublishedTableSegmentPage } from "metabase/data-studio/segments/hooks/use-published-table-segment-page";
import type { SegmentTabUrls } from "metabase/data-studio/segments/types";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { DataTestList } from "../../components/DataTestList";

type PublishedTableSegmentTestListPageParams = {
  tableId: string;
  segmentId: string;
};

export function PublishedTableSegmentTestListPage() {
  const params = useParams<PublishedTableSegmentTestListPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    usePublishedTableSegmentPage(params);

  if (isLoading || error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentTestListPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}

type DataModelSegmentTestListPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

export function DataModelSegmentTestListPage() {
  const params = useParams<DataModelSegmentTestListPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    useDataModelSegmentPage(params);

  if (isLoading || error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentTestListPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}

type SegmentTestListPageProps = {
  segment: Segment;
  tabUrls: SegmentTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

function SegmentTestListPage({
  segment,
  tabUrls,
  breadcrumbs,
  onRemove,
}: SegmentTestListPageProps) {
  const buildQuestion = useQuestionFromOptsBuilder();

  return (
    <PageContainer data-testid="segment-test-list">
      <SegmentHeader
        segment={segment}
        tabUrls={tabUrls}
        previewUrl={getDatasetQueryPreviewUrl(
          segment.definition,
          buildQuestion,
        )}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <DataTestList testType="segment" subjectId={segment.id} />
    </PageContainer>
  );
}
