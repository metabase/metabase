import { t } from "ttag";

import {
  skipToken,
  useGetTransformQuery,
  useListTableIndexesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isNullOrUndefined } from "metabase/utils/types";
import type { TransformId } from "metabase-types/api";

import { TransformHeader } from "../../components/TransformHeader";

import { NoIndexes } from "./NoIndexes";
import { TransformIndexTable } from "./TransformIndexTable";

type TransformIndexesPageProps = {
  params: {
    transformId?: string;
  };
};

export function TransformIndexesPage({ params }: TransformIndexesPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (transform === undefined || isLoading || !isNullOrUndefined(error)) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-indexes-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <TransformIndexesContent transformId={transform.id} />
    </PageContainer>
  );
}

function TransformIndexesContent({
  transformId,
}: {
  transformId: TransformId;
}) {
  const {
    data: indexes = [],
    isLoading,
    error,
  } = useListTableIndexesQuery({ "transform-id": transformId });

  if (isLoading || !isNullOrUndefined(error)) {
    return (
      <Center flex={1}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <TitleSection label={t`Indexes`}>
      {indexes.length === 0 ? (
        <NoIndexes />
      ) : (
        <TransformIndexTable indexes={indexes} />
      )}
    </TitleSection>
  );
}
