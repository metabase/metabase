import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
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
import { type Location, useNavigate, useSearchParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type {
  Database,
  ImplicitActionKind,
  TableId,
  WritebackAction,
} from "metabase-types/api";

import { ImplicitActionDefinitionContent } from "../../components/ImplicitActionDefinitionContent";
import { QueryActionEditor } from "../../components/QueryActionEditor";
import { QueryActionEditorPane } from "../../components/QueryActionEditorPane";
import { ACTION_NAME_MAX_LENGTH } from "../../constants";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useQueryActionDraft } from "../../hooks/use-query-action-draft";
import { getImplicitActionName, hasSinglePrimaryKey } from "../../utils";

import { CreateActionModal } from "./CreateActionModal";

export function NewActionPage() {
  const [searchParams] = useSearchParams();
  const tableId = Urls.extractEntityId(searchParams.get("table") ?? undefined);

  return tableId != null ? (
    <NewImplicitActionPage key={tableId} initialTableId={tableId} />
  ) : (
    <NewQueryActionPage />
  );
}

function NewQueryActionPage() {
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

  return <NewQueryActionPageBody databases={editableDatabases} />;
}

type NewQueryActionPageBodyProps = {
  databases: Database[];
};

function NewQueryActionPageBody({ databases }: NewQueryActionPageBodyProps) {
  const initialDatasetQuery = useMemo(
    () =>
      Question.create({
        DEPRECATED_RAW_MBQL_type: "native",
        DEPRECATED_RAW_MBQL_databaseId: databases[0]?.id,
      }).datasetQuery(),
    [databases],
  );
  const draft = useQueryActionDraft({ initialDatasetQuery });
  const [name, setName] = useState("");
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const navigate = useNavigate();
  const isSavedRef = useRef(false);
  const isDirty = draft.isDirty || name.trim().length > 0;

  const handleCreate = (action: WritebackAction) => {
    isSavedRef.current = true;
    navigate(Urls.dataStudioAction(action.id));
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
              onCancel={() => navigate(Urls.dataStudioActions())}
            />
          }
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link to={Urls.dataStudioActions()}>{t`Data actions`}</Link>
              {t`New action`}
            </DataStudioBreadcrumbs>
          }
        />
        <QueryActionEditorPane>
          <QueryActionEditor
            datasetQuery={draft.datasetQuery}
            uiState={uiState}
            databases={databases}
            onChangeDatasetQuery={draft.setDatasetQuery}
            onChangeUiState={setUiState}
          />
        </QueryActionEditorPane>
      </PageContainer>
      {isModalOpened && draft.definition != null && (
        <CreateActionModal
          definition={draft.definition}
          defaultName={name}
          defaultCollectionId={null}
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

const DEFAULT_KIND: ImplicitActionKind = "row/create";

type NewImplicitActionPageProps = {
  initialTableId: TableId;
};

function NewImplicitActionPage({ initialTableId }: NewImplicitActionPageProps) {
  const [tableId, setTableId] = useState(initialTableId);
  const [kind, setKind] = useState(DEFAULT_KIND);
  const [name, setName] = useState("");
  const { currentData: table } = useGetTableQueryMetadataQuery({ id: tableId });
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const navigate = useNavigate();
  const isSavedRef = useRef(false);
  const defaultName =
    table != null ? getImplicitActionName(kind, table.display_name) : "";
  const isDirty =
    name.trim().length > 0 ||
    kind !== DEFAULT_KIND ||
    tableId !== initialTableId;

  const handleCreate = (action: WritebackAction) => {
    isSavedRef.current = true;
    navigate(Urls.dataStudioAction(action.id));
  };

  const isLocationAllowed = useCallback(
    (location?: Location) => !location || isSavedRef.current,
    [],
  );

  return (
    <>
      <PageContainer data-testid="new-implicit-action">
        <PaneHeader
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={defaultName || t`New action`}
              maxLength={ACTION_NAME_MAX_LENGTH}
              isOptional
              onChange={setName}
            />
          }
          icon="bolt"
          actions={
            <PaneHeaderActions
              isValid={table != null && hasSinglePrimaryKey(table)}
              isDirty
              onSave={openModal}
              onCancel={() => navigate(Urls.dataStudioActions())}
            />
          }
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link to={Urls.dataStudioActions()}>{t`Data actions`}</Link>
              {t`New action`}
            </DataStudioBreadcrumbs>
          }
        />
        <ImplicitActionDefinitionContent
          tableId={tableId}
          kind={kind}
          onChangeTable={setTableId}
          onChangeKind={setKind}
        />
      </PageContainer>
      {isModalOpened && (
        <CreateActionModal
          definition={{ type: "implicit", kind, table_id: tableId }}
          defaultName={name.trim() || defaultName}
          defaultCollectionId={null}
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
