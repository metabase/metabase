import { useCallback, useEffect, useMemo, useState } from "react";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import {
  useActionListQuery,
  useDatabaseListQuery,
} from "metabase/common/hooks";
import { NotFound } from "metabase/components/ErrorPages";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Modal from "metabase/components/Modal";
import { useDispatch } from "metabase/lib/redux";
import { runQuestionQuery } from "metabase/query_builder/actions";
import { ActionsApi, MetabaseApi } from "metabase/services";
import * as Lib from "metabase-lib";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  DatasetColumn,
  DatasetData,
  WritebackActionId,
} from "metabase-types/api";

import { DeleteObjectModal } from "./DeleteObjectModal";
import { ObjectDetailBody } from "./ObjectDetailBody";
import { ObjectDetailHeader } from "./ObjectDetailHeader";
import {
  ErrorWrapper,
  ObjectDetailContainer,
  ObjectDetailWrapperDiv,
} from "./ObjectDetailView.styled";
import type { ObjectDetailProps, ObjectId } from "./types";
import {
  getActionItems,
  getDisplayId,
  getObjectName,
  getSinglePKIndex,
} from "./utils";

function filterByPk(
  query: Lib.Query,
  pkField: DatasetColumn,
  zoomedRowID: ObjectId | undefined,
) {
  if (typeof zoomedRowID === "undefined") {
    return query;
  }

  const stageIndex = -1;
  const column = Lib.fromLegacyColumn(query, stageIndex, pkField);
  const filterClause =
    typeof zoomedRowID === "number"
      ? Lib.numberFilterClause({
          operator: "=",
          column,
          values: [zoomedRowID],
        })
      : Lib.stringFilterClause({
          operator: "=",
          column,
          values: [zoomedRowID],
          options: {},
        });

  return Lib.filter(query, stageIndex, filterClause);
}

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

  const hasPk = !!data.cols.find(isPK);
  const hasFks = !_.isEmpty(tableForeignKeys);
  const hasRelationships = showRelations && hasFks && hasPk;

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
      const query = question?.query();
      const datasetQuery = query
        ? Lib.toLegacyQuery(filterByPk(query, pkField, zoomedRowID))
        : undefined;

      MetabaseApi.dataset(datasetQuery)
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
    const hadPrevZoomedRow = prevZoomedRowId != null;

    if (hasFks && hadPrevZoomedRow && prevZoomedRowId !== zoomedRowID) {
      loadFKReferences();
    }
  }, [hasFks, prevZoomedRowId, zoomedRowID, loadFKReferences]);

  useEffect(() => {
    const queryCompleted = !prevData && data;
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (queryCompleted && notFoundObject) {
      setHasNotFoundError(true);
    }
  }, [data, prevData, zoomedRowID, zoomedRow]);

  useEffect(() => {
    // if the card changed or table metadata loaded then reload fk references
    const tableFKsJustLoaded = _.isEmpty(prevTableForeignKeys) && hasFks;
    const hasCardChanged = data !== prevData;

    if (hasCardChanged || tableFKsJustLoaded) {
      loadFKReferences();
    }
  }, [hasFks, data, prevData, prevTableForeignKeys, loadFKReferences]);

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
    question.type() === "model" &&
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
