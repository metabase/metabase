import { useState } from "react";
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
import type { TableIndexEntry, Transform } from "metabase-types/api";

import { TransformHeader } from "../../components/TransformHeader";

import { IndexEditorModal } from "./IndexEditorModal/IndexEditorModal";
import { IndexPageActions } from "./IndexPageActions";
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
      <TransformIndexesContent transform={transform} readOnly={readOnly} />
    </PageContainer>
  );
}

function TransformIndexesContent({
  transform,
  readOnly = false,
}: {
  transform: Transform;
  readOnly: boolean | undefined;
}) {
  const {
    data: indexes = [],
    isLoading,
    error,
  } = useListTableIndexesQuery({ "transform-id": transform.id });
  const targetTableExists = transform.table != null;
  const hasRequestableIndexes =
    Object.keys(transform.requestable_indexes ?? {}).length > 0;
  const canCreate = targetTableExists && hasRequestableIndexes && !readOnly;
  const [editorState, setEditorState] = useState<{
    index?: TableIndexEntry;
  } | null>(null);

  const handleCreate = () => setEditorState({});

  if (isLoading || !isNullOrUndefined(error)) {
    return (
      <Center flex={1}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <>
      <TitleSection
        label={t`Indexes`}
        actions={
          <IndexPageActions
            readOnly={readOnly}
            targetTableExists={targetTableExists}
            handleCreate={handleCreate}
            canCreate={canCreate}
          />
        }
      >
        {indexes.length === 0 ? (
          <NoIndexes />
        ) : (
          <TransformIndexTable indexes={indexes} />
        )}
      </TitleSection>
      {editorState != null && (
        <IndexEditorModal
          transform={transform}
          index={editorState.index}
          onClose={() => setEditorState(null)}
        />
      )}
    </>
  );
}
