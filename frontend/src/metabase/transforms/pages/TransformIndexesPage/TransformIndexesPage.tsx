import { t } from "ttag";

import {
  skipToken,
  useGetTransformQuery,
  useListTableIndexesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Card, Center, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TableIndexEntry, TransformId } from "metabase-types/api";

import { TransformHeader } from "../../components/TransformHeader";

export type TransformIndexesPageParams = {
  transformId: string;
};

type TransformIndexesPageProps = {
  params?: TransformIndexesPageParams;
};

export function TransformIndexesPage({ params }: TransformIndexesPageProps) {
  const id = Urls.extractEntityId(params?.transformId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(id ?? skipToken);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (id == null || transform == null || isLoading || error != null) {
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

  if (isLoading || error != null) {
    return (
      <Center flex={1}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (indexes.length === 0) {
    return (
      <Card flex={1} withBorder>
        <Center h="100%">
          <Text c="text-secondary">{t`No indexes defined for this transform.`}</Text>
        </Center>
      </Card>
    );
  }

  return (
    <Card flex={1} withBorder>
      <Stack gap="md">
        {indexes.map((index, indexPosition) => (
          <TransformIndexRow
            key={index.request?.id ?? index.name ?? indexPosition}
            index={index}
          />
        ))}
      </Stack>
    </Card>
  );
}

function TransformIndexRow({ index }: { index: TableIndexEntry }) {
  const status = index.request?.status;
  return (
    <Stack gap={0}>
      <Text fw="bold">{index.name ?? index.kind}</Text>
      <Text c="text-secondary" size="sm">
        {status ? `${index.kind} · ${status}` : index.kind}
      </Text>
    </Stack>
  );
}
