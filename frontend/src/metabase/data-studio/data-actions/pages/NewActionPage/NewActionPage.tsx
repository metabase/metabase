import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/common/collections/hooks";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { hasNativeWritePermissions } from "metabase/common/utils/database";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { type Location, useNavigate } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type { Database, WritebackAction } from "metabase-types/api";

import { ActionEditor } from "../../components/ActionEditor";
import { ActionEditorPane } from "../../components/ActionEditorPane";
import { ACTION_NAME_MAX_LENGTH } from "../../constants";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useActionDraft } from "../../hooks/use-action-draft";

import { CreateActionModal } from "./CreateActionModal";

export function NewActionPage() {
  const { databases, isLoading, error } = useActionDatabases();
  const editableDatabases = useMemo(
    () => databases.filter(hasNativeWritePermissions),
    [databases],
  );

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (editableDatabases.length === 0) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          error={t`To create an action, you need permission to write native queries on a database with actions enabled.`}
        />
      </Center>
    );
  }

  return <NewActionPageBody databases={editableDatabases} />;
}

type NewActionPageBodyProps = {
  databases: Database[];
};

function NewActionPageBody({ databases }: NewActionPageBodyProps) {
  const initialDatasetQuery = useMemo(
    () =>
      Question.create({
        DEPRECATED_RAW_MBQL_type: "native",
        DEPRECATED_RAW_MBQL_databaseId: databases[0]?.id,
      }).datasetQuery(),
    [databases],
  );
  const draft = useActionDraft({ initialDatasetQuery });
  const defaultCollectionId = useGetDefaultCollectionId();
  const [name, setName] = useState("");
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const navigate = useNavigate();
  const isSavedRef = useRef(false);
  const isDirty = draft.isDirty || name.trim().length > 0;

  const handleCreate = (action: WritebackAction) => {
    isSavedRef.current = true;
    navigate(Urls.dataAction(action.id));
  };

  const isLocationAllowed = useCallback(
    (location?: Location) => !location || isSavedRef.current,
    [],
  );

  return (
    <>
      <PageContainer pos="relative" data-testid="action-query-editor">
        <PaneHeader
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New action`}
              maxLength={ACTION_NAME_MAX_LENGTH}
              isOptional
              onChange={setName}
            />
          }
          icon="bolt"
          actions={
            <PaneHeaderActions
              isValid={draft.isValid}
              isDirty
              onSave={openModal}
              onCancel={() => navigate(Urls.dataActionList())}
            />
          }
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link to={Urls.dataActionList()}>{t`Data actions`}</Link>
              {t`New action`}
            </DataStudioBreadcrumbs>
          }
        />
        <ActionEditorPane>
          <ActionEditor
            datasetQuery={draft.datasetQuery}
            uiState={uiState}
            databases={databases}
            onChangeDatasetQuery={draft.setDatasetQuery}
            onChangeUiState={setUiState}
          />
        </ActionEditorPane>
      </PageContainer>
      {isModalOpened && draft.definition != null && (
        <CreateActionModal
          definition={draft.definition}
          defaultName={name}
          defaultCollectionId={canonicalCollectionId(defaultCollectionId)}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal
        isEnabled={isDirty}
        isLocationAllowed={isLocationAllowed}
      />
    </>
  );
}
