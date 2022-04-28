import React, { useState, useEffect } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";
import { Table } from "metabase-types/types/Table";
import { ForeignKey } from "metabase-types/api/foreignKey";
import { DatasetData } from "metabase-types/types/Dataset";
import { ObjectId, OnVisualizationClickType } from "./types";

import Modal from "metabase/components/Modal";
import Button from "metabase/core/components/Button";
import { NotFound } from "metabase/containers/ErrorPages";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { usePrevious } from "metabase/hooks/use-previous";

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
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import { getObjectName, getIdValue } from "./utils";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";
import {
  ObjectDetailModal,
  ObjectDetailBodyWrapper,
  CloseButton,
  ErrorWrapper,
} from "./ObjectDetail.styled";

const mapStateToProps = (state: unknown) => ({
  question: getQuestion(state),
  table: getTableMetadata(state),
  tableForeignKeys: getTableForeignKeys(state),
  tableForeignKeyReferences: getTableForeignKeyReferences(state),
  zoomedRow: getZoomRow(state),
  zoomedRowID: getZoomedObjectId(state),
  canZoomPreviousRow: getCanZoomPreviousRow(state),
  canZoomNextRow: getCanZoomNextRow(state),
});

// ugh, using function form of mapDispatchToProps here due to circlular dependency with actions
const mapDispatchToProps = (dispatch: any) => ({
  fetchTableFks: (id: number) =>
    dispatch(Tables.objectActions.fetchForeignKeys({ id })),
  loadObjectDetailFKReferences: () => dispatch(loadObjectDetailFKReferences()),
  followForeignKey: (fk: ForeignKey) => dispatch(followForeignKey(fk)),
  viewPreviousObjectDetail: () => dispatch(viewPreviousObjectDetail()),
  viewNextObjectDetail: () => dispatch(viewNextObjectDetail()),
  closeObjectDetail: () => dispatch(closeObjectDetail()),
});

export interface ObjectDetailProps {
  data: DatasetData;
  question: Question;
  table: Table | null;
  zoomedRow: unknown[] | undefined;
  zoomedRowID: ObjectId;
  tableForeignKeys: ForeignKey[];
  tableForeignKeyReferences: {
    [key: number]: { status: number; value: number };
  };
  settings: any;
  canZoomPreviousRow: boolean;
  canZoomNextRow: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: any) => boolean;
  fetchTableFks: (id: number) => void;
  loadObjectDetailFKReferences: () => void;
  followForeignKey: (fk: ForeignKey) => void;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
}

export function ObjectDetailFn({
  data,
  question,
  table,
  zoomedRow,
  zoomedRowID,
  tableForeignKeys,
  tableForeignKeyReferences,
  settings,
  canZoomPreviousRow,
  canZoomNextRow,
  onVisualizationClick,
  visualizationIsClickable,
  fetchTableFks,
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  closeObjectDetail,
}: ObjectDetailProps): JSX.Element | null {
  const [hasNotFoundError, setHasNotFoundError] = useState(false);
  const prevZoomedRowId = usePrevious(zoomedRowID);
  const prevData = usePrevious(data);
  const prevTableForeignKeys = usePrevious(tableForeignKeys);

  useOnMount(() => {
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (data && notFoundObject) {
      setHasNotFoundError(true);
      return;
    }

    if (table && table.fks == null) {
      fetchTableFks(table.id);
    }
    // load up FK references
    if (tableForeignKeys) {
      loadObjectDetailFKReferences();
    }
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  });

  useEffect(() => {
    if (tableForeignKeys && prevZoomedRowId !== zoomedRowID) {
      loadObjectDetailFKReferences();
    }
  }, [
    tableForeignKeys,
    prevZoomedRowId,
    zoomedRowID,
    loadObjectDetailFKReferences,
  ]);

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
      loadObjectDetailFKReferences();
    }
  }, [
    tableForeignKeys,
    data,
    prevData,
    prevTableForeignKeys,
    loadObjectDetailFKReferences,
  ]);

  const onKeyDown = (event: KeyboardEvent) => {
    const capturedKeys: { [key: string]: () => void } = {
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

  const canZoom = !!zoomedRow;
  const objectName = getObjectName({ table, question });

  const hasRelationships = tableForeignKeys && !!tableForeignKeys.length;

  return (
    <Modal
      isOpen
      full={false}
      onClose={closeObjectDetail}
      className={""} // need an empty className to override the Modal default width
    >
      <ObjectDetailModal wide={hasRelationships}>
        {hasNotFoundError ? (
          <ErrorWrapper>
            <NotFound />
          </ErrorWrapper>
        ) : (
          <div className="ObjectDetail" data-testid="object-detail">
            <ObjectDetailHeader
              canZoom={canZoom}
              objectName={objectName}
              objectId={getIdValue({ data, zoomedRowID })}
              canZoomPreviousRow={canZoomPreviousRow}
              canZoomNextRow={canZoomNextRow}
              viewPreviousObjectDetail={viewPreviousObjectDetail}
              viewNextObjectDetail={viewNextObjectDetail}
              closeObjectDetail={closeObjectDetail}
            />
            <ObjectDetailBody
              data={data}
              objectName={objectName}
              zoomedRow={zoomedRow}
              settings={settings}
              onVisualizationClick={onVisualizationClick}
              visualizationIsClickable={visualizationIsClickable}
              tableForeignKeys={tableForeignKeys}
              tableForeignKeyReferences={tableForeignKeyReferences}
              followForeignKey={followForeignKey}
            />
          </div>
        )}
      </ObjectDetailModal>
    </Modal>
  );
}
export interface ObjectDetailHeaderProps {
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId;
  canZoomPreviousRow: boolean;
  canZoomNextRow: boolean;
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
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  closeObjectDetail,
}: ObjectDetailHeaderProps): JSX.Element {
  return (
    <div className="Grid border-bottom relative">
      <div className="Grid-cell">
        <h1 className="p3">
          {objectName} {objectId}
        </h1>
      </div>
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
              data-testId="object-detail-close-button"
              onlyIcon
              borderless
              disabled={!canZoomNextRow}
              onClick={closeObjectDetail}
              icon="close"
              iconSize={20}
            />
          </CloseButton>
        </div>
      </div>
    </div>
  );
}

export interface ObjectDetailBodyProps {
  data: DatasetData;
  objectName: string;
  zoomedRow: unknown[] | undefined;
  settings: unknown;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
  tableForeignKeys: ForeignKey[];
  tableForeignKeyReferences: {
    [key: number]: { status: number; value: number };
  };
  followForeignKey: (fk: ForeignKey) => void;
}

export function ObjectDetailBody({
  data,
  objectName,
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
  tableForeignKeys,
  tableForeignKeyReferences,
  followForeignKey,
}: ObjectDetailBodyProps): JSX.Element {
  return (
    <ObjectDetailBodyWrapper>
      <DetailsTable
        data={data}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
      />
      <Relationships
        objectName={objectName}
        tableForeignKeys={tableForeignKeys}
        tableForeignKeyReferences={tableForeignKeyReferences}
        foreignKeyClicked={followForeignKey}
      />
    </ObjectDetailBodyWrapper>
  );
}

export const ObjectDetailProperties = {
  uiName: t`Object Detail`,
  identifier: "object",
  iconName: "document",
  noun: t`object`,
  hidden: true,
  settings: {
    // adding a "hidden" argument to this settings function breaks pivot table settings
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ...columnSettings({ hidden: true }),
  },
};

const ObjectDetail = Object.assign(
  connect(mapStateToProps, mapDispatchToProps)(ObjectDetailFn),
  ObjectDetailProperties,
);

export default ObjectDetail;
