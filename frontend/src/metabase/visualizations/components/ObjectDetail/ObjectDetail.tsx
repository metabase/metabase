import { useState, useEffect, useCallback, useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";
import { useMount, usePrevious } from "react-use";

import { State } from "metabase-types/store";
import type {
  ConcreteTableId,
  DatasetData,
  VisualizationSettings,
  WritebackAction,
} from "metabase-types/api";

import {
  useActionListQuery,
  useDatabaseListQuery,
} from "metabase/common/hooks";
import Button from "metabase/core/components/Button";
import { NotFound } from "metabase/containers/ErrorPages";
import EntityMenu from "metabase/components/EntityMenu";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { Flex } from "metabase/ui/components";

import Tables from "metabase/entities/tables";
import {
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  closeObjectDetail,
} from "metabase/query_builder/actions";
import {
  getQuestion,
  getTableMetadata,
  getTableForeignKeys,
  getTableForeignKeyReferences,
  getZoomRow,
  getZoomedObjectId,
  getCanZoomPreviousRow,
  getCanZoomNextRow,
} from "metabase/query_builder/selectors";
import { getUser } from "metabase/selectors/user";

import { MetabaseApi } from "metabase/services";
import { canRunAction } from "metabase-lib/actions/utils";
import Database from "metabase-lib/metadata/Database";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import { isPK } from "metabase-lib/types/utils/isa";
import ForeignKey from "metabase-lib/metadata/ForeignKey";
import type {
  ObjectId,
  OnVisualizationClickType,
  ObjectDetailProps,
} from "./types";

import {
  getObjectName,
  getDisplayId,
  getIdValue,
  getSingleResultsRow,
  getSinglePKIndex,
} from "./utils";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";
import {
  RootModal,
  ObjectDetailContainer,
  ObjectDetailHeaderWrapper,
  ObjectDetailBodyWrapper,
  ObjectIdLabel,
  CloseButton,
  ErrorWrapper,
  PaginationFooter,
  ObjectDetailWrapperDiv,
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

      if (capturedKeys[event.key]) {
        event.preventDefault();
        capturedKeys[event.key]();
      }
      if (event.key === "Escape") {
        closeObjectDetail();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    hasNotFoundError,
    viewPreviousObjectDetail,
    viewNextObjectDetail,
    closeObjectDetail,
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

  const { data: modelActions = [] } = useActionListQuery({
    enabled: areImplicitActionsEnabled,
    query: { "model-id": question?.id() },
  });

  const { data: databases = [] } = useDatabaseListQuery({
    enabled: areImplicitActionsEnabled,
  });

  const actionItems = areImplicitActionsEnabled
    ? getActionItems({
        databases,
        modelActions,
        onDelete: () => "TODO: metabase#32323",
        onUpdate: () => "TODO: metabase#32322",
      })
    : [];

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
  );
}

export function ObjectDetailWrapper({
  question,
  isDataApp,
  data,
  closeObjectDetail,
  card,
  dashcard,
  isObjectDetail,
  ...props
}: ObjectDetailProps) {
  const [currentObjectIndex, setCurrentObjectIndex] = useState(0);

  // only show modal if this object detail was triggered via an object detail zoom action
  const shouldShowModal = isObjectDetail;

  if (shouldShowModal) {
    return (
      <RootModal
        isOpen
        full={false}
        onClose={closeObjectDetail}
        className={""} // need an empty className to override the Modal default width
      >
        <ObjectDetailView
          {...props}
          showHeader
          data={data}
          question={question}
          closeObjectDetail={closeObjectDetail}
        />
      </RootModal>
    );
  }

  const hasPagination = data?.rows?.length > 1;

  return (
    <>
      <ObjectDetailView
        {...props}
        zoomedRow={data.rows[currentObjectIndex]}
        data={data}
        question={question}
        showHeader={props.settings["detail.showHeader"]}
        showControls={false}
        showRelations={false}
        closeObjectDetail={closeObjectDetail}
        isDataApp={isDataApp}
      />
      {hasPagination && (
        <PaginationFooter
          data-testid="pagination-footer"
          start={currentObjectIndex}
          end={currentObjectIndex}
          total={data.rows.length}
          onNextPage={() => setCurrentObjectIndex(prev => prev + 1)}
          onPreviousPage={() => setCurrentObjectIndex(prev => prev - 1)}
          singleItem
        />
      )}
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

const getActionItems = ({
  databases,
  modelActions,
  onDelete,
  onUpdate,
}: {
  databases: Database[];
  modelActions: WritebackAction[];
  onDelete: (action: WritebackAction) => void;
  onUpdate: (action: WritebackAction) => void;
}) => {
  const actionItems = [];

  const updateAction = modelActions.find(
    action =>
      action.type === "implicit" &&
      action.kind === "row/update" &&
      !action.archived,
  );

  const deleteAction = modelActions.find(
    action =>
      action.type === "implicit" &&
      action.kind === "row/delete" &&
      !action.archived,
  );

  if (updateAction && canRunAction(updateAction, databases)) {
    actionItems.push({
      title: t`Update`,
      icon: "pencil",
      action: () => onUpdate(updateAction),
    });
  }

  if (deleteAction && canRunAction(deleteAction, databases)) {
    actionItems.push({
      title: t`Delete`,
      icon: "trash",
      action: () => onDelete(deleteAction),
    });
  }

  return actionItems;
};

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
  const showButtonsContainer = showControls || actionItems.length > 0;

  return (
    <ObjectDetailHeaderWrapper className="Grid">
      <div className="Grid-cell">
        <h2 className="p3">
          {objectName}
          {objectId !== null && <ObjectIdLabel> {objectId}</ObjectIdLabel>}
        </h2>
      </div>

      {showButtonsContainer && (
        <Flex align="center" gap="0.5rem" p="1rem">
          {canZoom && showControls && (
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
            />
          )}

          {showControls && (
            <CloseButton>
              <Button
                data-testid="object-detail-close-button"
                onlyIcon
                borderless
                onClick={closeObjectDetail}
                icon="close"
              />
            </CloseButton>
          )}
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
