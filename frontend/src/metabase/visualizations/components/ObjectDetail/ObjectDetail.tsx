import { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";
import { useMount, usePrevious } from "react-use";

import type { State } from "metabase-types/store";
import type {
  ConcreteTableId,
  DatasetData,
  VisualizationSettings,
  WritebackActionId,
} from "metabase-types/api";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import {
  useActionListQuery,
  useDatabaseListQuery,
} from "metabase/common/hooks";
import Button from "metabase/core/components/Button";
import { NotFound } from "metabase/containers/ErrorPages";
import EntityMenu from "metabase/components/EntityMenu";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Modal from "metabase/components/Modal";
import { Flex } from "metabase/ui/components";

import Tables from "metabase/entities/tables";
import {
  closeObjectDetail,
  followForeignKey,
  loadObjectDetailFKReferences,
  runQuestionQuery,
  viewNextObjectDetail,
  viewPreviousObjectDetail,
} from "metabase/query_builder/actions";
import {
  getCanZoomNextRow,
  getCanZoomPreviousRow,
  getQuestion,
  getTableForeignKeyReferences,
  getTableForeignKeys,
  getTableMetadata,
  getZoomedObjectId,
  getZoomRow,
} from "metabase/query_builder/selectors";
import { getUser } from "metabase/selectors/user";

import { useDispatch } from "metabase/lib/redux";
import { ActionsApi, MetabaseApi } from "metabase/services";
import { ObjectDetailWrapper } from "metabase/visualizations/components/ObjectDetail/ObjectDetailWrapper";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import { isPK } from "metabase-lib/types/utils/isa";
import type ForeignKey from "metabase-lib/metadata/ForeignKey";
import type {
  ObjectDetailProps,
  ObjectId,
  OnVisualizationClickType,
} from "./types";

import { DeleteObjectModal } from "./DeleteObjectModal";
import {
  getActionItems,
  getDisplayId,
  getIdValue,
  getObjectName,
  getSinglePKIndex,
  getSingleResultsRow,
} from "./utils";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";
import {
  CloseButton,
  ErrorWrapper,
  ObjectDetailBodyWrapper,
  ObjectDetailContainer,
  ObjectDetailHeaderWrapper,
  ObjectDetailWrapperDiv,
  ObjectIdLabel,
} from "./ObjectDetail.styled";

const mapStateToProps = (state: State, { data }: ObjectDetailProps) => {
  const isLoggedIn = !!getUser(state);

  if (!isLoggedIn) {
    return {};
  }

  const table = getTableMetadata(state);
  let zoomedRowID = getZoomedObjectId(state);
  const isZooming = zoomedRowID != null;

  if (!isZooming) {
    zoomedRowID = getIdValue({ data, tableId: table?.id });
  }

  const zoomedRow = isZooming ? getZoomRow(state) : getSingleResultsRow(data);
  const canZoomPreviousRow = isZooming ? getCanZoomPreviousRow(state) : false;
  const canZoomNextRow = isZooming ? Boolean(getCanZoomNextRow(state)) : false;

  return {
    // FIXME: remove the non-null assertion operator
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    question: getQuestion(state)!,
    table,
    tableForeignKeys: getTableForeignKeys(state),
    tableForeignKeyReferences: getTableForeignKeyReferences(state),
    zoomedRowID,
    zoomedRow,
    canZoom: isZooming && !!zoomedRow,
    canZoomPreviousRow,
    canZoomNextRow,
  };
};

// ugh, using function form of mapDispatchToProps here due to circlular dependency with actions
const mapDispatchToProps = (dispatch: any) => ({
  fetchTableFks: (id: number) =>
    dispatch(Tables.objectActions.fetchForeignKeys({ id })),
  loadObjectDetailFKReferences: (args: any) =>
    dispatch(loadObjectDetailFKReferences(args)),
  followForeignKey: ({
    objectId,
    fk,
  }: {
    objectId: ObjectId;
    fk: ForeignKey;
  }) => dispatch(followForeignKey({ objectId, fk })),
  viewPreviousObjectDetail: () => dispatch(viewPreviousObjectDetail()),
  viewNextObjectDetail: () => dispatch(viewNextObjectDetail()),
  closeObjectDetail: () => dispatch(closeObjectDetail()),
});

export function ObjectDetailView({
  data: passedData,
  question,
  table,
  zoomedRow: passedZoomedRow,
  zoomedRowID,
  tableForeignKeys,
  tableForeignKeyReferences,
  settings,
  canZoom,
  canZoomPreviousRow,
  canZoomNextRow,
  showControls = true,
  showRelations = true,
  showHeader,
  onVisualizationClick,
  visualizationIsClickable,
  fetchTableFks,
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  closeObjectDetail,
  className,
}: ObjectDetailProps): JSX.Element | null {
  const [hasNotFoundError, setHasNotFoundError] = useState(false);
  const [maybeLoading, setMaybeLoading] = useState(false);
  const prevZoomedRowId = usePrevious(zoomedRowID);
  const prevData = usePrevious(passedData);
  const prevTableForeignKeys = usePrevious(tableForeignKeys);
  const [data, setData] = useState<DatasetData>(passedData);
  const [actionId, setActionId] = useState<WritebackActionId>();
  const [deleteActionId, setDeleteActionId] = useState<WritebackActionId>();

  const isActionExecuteModalOpen = typeof actionId === "number";
  const isDeleteModalOpen = typeof deleteActionId === "number";
  const isModalOpen = isActionExecuteModalOpen || isDeleteModalOpen;

  const handleExecuteModalClose = () => {
    setActionId(undefined);
  };

  const handleDeleteModalClose = () => {
    setDeleteActionId(undefined);
  };

  const pkIndex = useMemo(
    () => getSinglePKIndex(passedData?.cols),
    [passedData],
  );

  const zoomedRow = useMemo(
    () =>
      passedZoomedRow ||
      (pkIndex !== undefined &&
        data.rows.find(row => row[pkIndex] === zoomedRowID)) ||
      undefined,
    [passedZoomedRow, pkIndex, data, zoomedRowID],
  );

  const loadFKReferences = useCallback(() => {
    if (zoomedRowID) {
      loadObjectDetailFKReferences({ objectId: zoomedRowID });
    }
  }, [zoomedRowID, loadObjectDetailFKReferences]);

  useMount(() => {
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (data && notFoundObject) {
      setMaybeLoading(true);
      setHasNotFoundError(true);
      return;
    }

    if (table && _.isEmpty(table.fks) && !isVirtualCardId(table.id)) {
      fetchTableFks(table.id as ConcreteTableId);
    }
    // load up FK references
    if (!_.isEmpty(tableForeignKeys)) {
      loadFKReferences();
    }
  });

  useEffect(() => {
    if (hasNotFoundError) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const capturedKeys: Record<string, () => void> = {
        ArrowUp: viewPreviousObjectDetail,
        ArrowDown: viewNextObjectDetail,
        Escape: closeObjectDetail,
      };

      if (capturedKeys[event.key] && !isModalOpen) {
        event.preventDefault();
        capturedKeys[event.key]();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    hasNotFoundError,
    viewPreviousObjectDetail,
    viewNextObjectDetail,
    closeObjectDetail,
    isModalOpen,
  ]);

  useEffect(() => {
    if (maybeLoading && pkIndex !== undefined) {
      // if we don't have the row in the current data, try to fetch this single row
      const pkField = passedData.cols[pkIndex];
      const filteredQuestion = question?.filter("=", pkField, zoomedRowID);
      MetabaseApi.dataset(filteredQuestion?._card.dataset_query)
        .then(result => {
          if (result?.data?.rows?.length > 0) {
            const newRow = result.data.rows[0];
            setData(prevData => ({
              ...prevData,
              rows: [newRow, ...prevData.rows],
            }));
            setHasNotFoundError(false);
          }
        })
        .catch(() => {
          setHasNotFoundError(true);
        })
        .finally(() => {
          setMaybeLoading(false);
        });
    }
  }, [maybeLoading, passedData, question, zoomedRowID, pkIndex]);

  useEffect(() => {
    if (!_.isEmpty(tableForeignKeys) && prevZoomedRowId !== zoomedRowID) {
      loadFKReferences();
    }
  }, [tableForeignKeys, prevZoomedRowId, zoomedRowID, loadFKReferences]);

  useEffect(() => {
    const queryCompleted = !prevData && data;
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (queryCompleted && notFoundObject) {
      setHasNotFoundError(true);
    }
  }, [data, prevData, zoomedRowID, zoomedRow]);

  useEffect(() => {
    // if the card changed or table metadata loaded then reload fk references
    const tableFKsJustLoaded =
      _.isEmpty(prevTableForeignKeys) && !_.isEmpty(tableForeignKeys);
    if (data !== prevData || tableFKsJustLoaded) {
      loadFKReferences();
    }
  }, [
    tableForeignKeys,
    data,
    prevData,
    prevTableForeignKeys,
    loadFKReferences,
  ]);

  const onFollowForeignKey = useCallback(
    (fk: ForeignKey) => {
      zoomedRowID !== undefined
        ? followForeignKey({ objectId: zoomedRowID, fk })
        : _.noop();
    },
    [zoomedRowID, followForeignKey],
  );

  const areImplicitActionsEnabled =
    question &&
    question.canWrite() &&
    question.isDataset() &&
    question.supportsImplicitActions();

  const { data: actions = [] } = useActionListQuery({
    enabled: areImplicitActionsEnabled,
    query: { "model-id": question?.id() },
  });

  const { data: databases = [] } = useDatabaseListQuery({
    enabled: areImplicitActionsEnabled,
  });

  const actionItems = areImplicitActionsEnabled
    ? getActionItems({
        actions,
        databases,
        onDelete: action => setDeleteActionId(action.id),
        onUpdate: action => setActionId(action.id),
      })
    : [];

  const fetchInitialValues = useCallback(async () => {
    if (typeof actionId !== "number") {
      return {};
    }

    return ActionsApi.prefetchValues({
      id: actionId,
      parameters: JSON.stringify({ id: String(zoomedRowID) }),
    });
  }, [actionId, zoomedRowID]);

  const initialValues = useMemo(
    () => ({ id: zoomedRowID ?? null }),
    [zoomedRowID],
  );

  const dispatch = useDispatch();

  const handleActionSuccess = useCallback(() => {
    dispatch(runQuestionQuery());
  }, [dispatch]);

  const handleDeleteSuccess = useCallback(() => {
    handleActionSuccess();
    closeObjectDetail();
  }, [closeObjectDetail, handleActionSuccess]);

  if (!data) {
    return null;
  }

  const objectName = getObjectName({
    table,
    question,
    cols: data.cols,
    zoomedRow,
  });

  const displayId = getDisplayId({
    cols: data.cols,
    zoomedRow,
    tableId: table?.id,
    settings,
  });

  const hasPk = !!data.cols.find(isPK);
  const hasRelationships =
    showRelations && !_.isEmpty(tableForeignKeys) && hasPk;

  return (
    <>
      <ObjectDetailContainer wide={hasRelationships} className={className}>
        {maybeLoading ? (
          <ErrorWrapper>
            <LoadingSpinner />
          </ErrorWrapper>
        ) : hasNotFoundError ? (
          <ErrorWrapper>
            <NotFound message={t`We couldn't find that record`} />
          </ErrorWrapper>
        ) : (
          <ObjectDetailWrapperDiv
            className="ObjectDetail"
            data-testid="object-detail"
          >
            {showHeader && (
              <ObjectDetailHeader
                actionItems={actionItems}
                canZoom={Boolean(
                  canZoom && (canZoomNextRow || canZoomPreviousRow),
                )}
                objectName={objectName}
                objectId={displayId}
                canZoomPreviousRow={!!canZoomPreviousRow}
                canZoomNextRow={canZoomNextRow}
                showControls={showControls}
                viewPreviousObjectDetail={viewPreviousObjectDetail}
                viewNextObjectDetail={viewNextObjectDetail}
                closeObjectDetail={closeObjectDetail}
              />
            )}
            <ObjectDetailBody
              data={data}
              objectName={objectName}
              zoomedRow={zoomedRow ?? []}
              settings={settings}
              hasRelationships={hasRelationships}
              onVisualizationClick={onVisualizationClick}
              visualizationIsClickable={visualizationIsClickable}
              tableForeignKeys={tableForeignKeys}
              tableForeignKeyReferences={tableForeignKeyReferences}
              followForeignKey={onFollowForeignKey}
            />
          </ObjectDetailWrapperDiv>
        )}
      </ObjectDetailContainer>

      <Modal
        isOpen={isActionExecuteModalOpen}
        onClose={handleExecuteModalClose}
      >
        <ActionExecuteModal
          actionId={actionId}
          initialValues={initialValues}
          fetchInitialValues={fetchInitialValues}
          shouldPrefetch
          onClose={handleExecuteModalClose}
          onSuccess={handleActionSuccess}
        />
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={handleDeleteModalClose}>
        <DeleteObjectModal
          actionId={deleteActionId}
          objectId={zoomedRowID}
          onClose={handleDeleteModalClose}
          onSuccess={handleDeleteSuccess}
        />
      </Modal>
    </>
  );
}

export interface ObjectDetailHeaderProps {
  actionItems: {
    title: string;
    icon: string;
    action: () => void;
  }[];
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null | unknown;
  canZoomPreviousRow: boolean;
  canZoomNextRow?: boolean;
  showControls?: boolean;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
}

export function ObjectDetailHeader({
  actionItems,
  canZoom,
  objectName,
  objectId,
  canZoomPreviousRow,
  canZoomNextRow,
  showControls = true,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  closeObjectDetail,
}: ObjectDetailHeaderProps): JSX.Element {
  return (
    <ObjectDetailHeaderWrapper className="Grid">
      <div className="Grid-cell">
        <h2 className="p3">
          {objectName}
          {objectId !== null && <ObjectIdLabel> {objectId}</ObjectIdLabel>}
        </h2>
      </div>

      {showControls && (
        <Flex align="center" gap="0.5rem" p="1rem">
          {canZoom && (
            <>
              <Button
                data-testid="view-previous-object-detail"
                onlyIcon
                borderless
                disabled={!canZoomPreviousRow}
                onClick={viewPreviousObjectDetail}
                icon="chevronup"
              />
              <Button
                data-testid="view-next-object-detail"
                onlyIcon
                borderless
                disabled={!canZoomNextRow}
                onClick={viewNextObjectDetail}
                icon="chevrondown"
              />
            </>
          )}

          {actionItems.length > 0 && (
            <EntityMenu
              horizontalAttachments={["right", "left"]}
              items={actionItems}
              triggerIcon="ellipsis"
              triggerProps={{
                "data-testid": "actions-menu",
              }}
            />
          )}

          <CloseButton>
            <Button
              data-testid="object-detail-close-button"
              onlyIcon
              borderless
              onClick={closeObjectDetail}
              icon="close"
            />
          </CloseButton>
        </Flex>
      )}
    </ObjectDetailHeaderWrapper>
  );
}

export interface ObjectDetailBodyProps {
  data: DatasetData;
  objectName: string;
  zoomedRow: unknown[];
  settings: VisualizationSettings;
  hasRelationships: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: {
    [key: number]: { status: number; value: number };
  };
  followForeignKey?: (fk: ForeignKey) => void;
}

export function ObjectDetailBody({
  data,
  objectName,
  zoomedRow,
  settings,
  hasRelationships = false,
  onVisualizationClick,
  visualizationIsClickable,
  tableForeignKeys,
  tableForeignKeyReferences,
  followForeignKey,
}: ObjectDetailBodyProps): JSX.Element {
  const showRelationships =
    hasRelationships &&
    tableForeignKeys &&
    tableForeignKeyReferences &&
    followForeignKey;

  return (
    <ObjectDetailBodyWrapper>
      <DetailsTable
        data={data}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
      />
      {showRelationships && (
        <Relationships
          objectName={objectName}
          tableForeignKeys={tableForeignKeys}
          tableForeignKeyReferences={tableForeignKeyReferences}
          foreignKeyClicked={followForeignKey}
        />
      )}
    </ObjectDetailBodyWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(ObjectDetailWrapper);
