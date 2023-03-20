import React, { useState, useEffect, useCallback } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { useMount, usePrevious } from "react-use";
import { State } from "metabase-types/store";
import type {
  ForeignKey,
  ConcreteTableId,
  VisualizationSettings,
} from "metabase-types/api";
import { DatasetData } from "metabase-types/types/Dataset";

import Button from "metabase/core/components/Button";
import { NotFound } from "metabase/containers/ErrorPages";

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

import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import { isPK } from "metabase-lib/types/utils/isa";
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
    // FIXME: remove the type cast
    tableForeignKeys: getTableForeignKeys(state) as ForeignKey[],
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

export function ObjectDetailFn({
  data,
  question,
  table,
  zoomedRow,
  zoomedRowID,
  tableForeignKeys,
  tableForeignKeyReferences,
  settings,
  canZoom,
  canZoomPreviousRow,
  canZoomNextRow,
  showActions = true,
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
  const prevZoomedRowId = usePrevious(zoomedRowID);
  const prevData = usePrevious(data);
  const prevTableForeignKeys = usePrevious(tableForeignKeys);

  const loadFKReferences = useCallback(() => {
    if (zoomedRowID) {
      loadObjectDetailFKReferences({ objectId: zoomedRowID });
    }
  }, [zoomedRowID, loadObjectDetailFKReferences]);

  useMount(() => {
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (data && notFoundObject) {
      setHasNotFoundError(true);
      return;
    }

    if (table && table.fks == null && !isVirtualCardId(table.id)) {
      fetchTableFks(table.id as ConcreteTableId);
    }
    // load up FK references
    if (tableForeignKeys) {
      loadFKReferences();
    }
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  });

  useEffect(() => {
    if (tableForeignKeys && prevZoomedRowId !== zoomedRowID) {
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
    const tableFKsJustLoaded = !prevTableForeignKeys && tableForeignKeys;
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
    showRelations && !!(tableForeignKeys && !!tableForeignKeys.length && hasPk);

  return (
    <ObjectDetailContainer wide={hasRelationships} className={className}>
      {hasNotFoundError ? (
        <ErrorWrapper>
          <NotFound />
        </ErrorWrapper>
      ) : (
        <ObjectDetailWrapperDiv
          className="ObjectDetail"
          data-testid="object-detail"
        >
          {showHeader && (
            <ObjectDetailHeader
              canZoom={Boolean(
                canZoom && (canZoomNextRow || canZoomPreviousRow),
              )}
              objectName={objectName}
              objectId={displayId}
              canZoomPreviousRow={!!canZoomPreviousRow}
              canZoomNextRow={canZoomNextRow}
              showActions={showActions}
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
        <ObjectDetailFn
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
      <ObjectDetailFn
        {...props}
        zoomedRow={data.rows[currentObjectIndex]}
        data={data}
        question={question}
        showHeader={props.settings["detail.showHeader"]}
        showActions={false}
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
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null | unknown;
  canZoomPreviousRow: boolean;
  canZoomNextRow?: boolean;
  showActions?: boolean;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
}

export function ObjectDetailHeader({
  canZoom,
  objectName,
  objectId,
  canZoomPreviousRow,
  canZoomNextRow,
  showActions = true,
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
      {showActions && (
        <div className="flex align-center">
          <div className="flex p2">
            {!!canZoom && (
              <>
                <Button
                  data-testid="view-previous-object-detail"
                  onlyIcon
                  borderless
                  className="mr1"
                  disabled={!canZoomPreviousRow}
                  onClick={viewPreviousObjectDetail}
                  icon="chevronup"
                  iconSize={20}
                />
                <Button
                  data-testid="view-next-object-detail"
                  onlyIcon
                  borderless
                  disabled={!canZoomNextRow}
                  onClick={viewNextObjectDetail}
                  icon="chevrondown"
                  iconSize={20}
                />
              </>
            )}
            <CloseButton>
              <Button
                data-testid="object-detail-close-button"
                onlyIcon
                borderless
                onClick={closeObjectDetail}
                icon="close"
                iconSize={20}
              />
            </CloseButton>
          </div>
        </div>
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

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(ObjectDetailWrapper);
