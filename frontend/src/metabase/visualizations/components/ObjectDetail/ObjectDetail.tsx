import React, { useState, useEffect, useCallback } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import cx from "classnames";

import Question from "metabase-lib/lib/Question";
import { Table } from "metabase-types/types/Table";
import { ForeignKey } from "metabase-types/api/foreignKey";
import { DatasetData } from "metabase-types/types/Dataset";
import { ObjectId, OnVisualizationClickType } from "./types";

import DirectionalButton from "metabase/components/DirectionalButton";
import Icon from "metabase/components/Icon";
import { NotFound } from "metabase/containers/ErrorPages";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { usePrevious } from "metabase/hooks/use-previous";

import Tables from "metabase/entities/tables";
import {
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
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
import { State } from "metabase-types/store";

import { getObjectName, getIdValue, getSingleResultsRow } from "./utils";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";

const mapStateToProps = (state: State, { data }: ObjectDetailProps) => {
  let zoomedRowID = getZoomedObjectId(state);
  const isZooming = zoomedRowID != null;

  if (!isZooming) {
    zoomedRowID = getIdValue({ data });
  }

  const zoomedRow = isZooming ? getZoomRow(state) : getSingleResultsRow(data);
  const canZoomPreviousRow = isZooming ? getCanZoomPreviousRow(state) : false;
  const canZoomNextRow = isZooming ? getCanZoomNextRow(state) : false;

  return {
    question: getQuestion(state),
    table: getTableMetadata(state),
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
  followForeignKey: ({ objectId, fk }: { objectId: number; fk: ForeignKey }) =>
    dispatch(followForeignKey({ objectId, fk })),
  viewPreviousObjectDetail: () => dispatch(viewPreviousObjectDetail()),
  viewNextObjectDetail: () => dispatch(viewNextObjectDetail()),
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
  canZoom: boolean;
  canZoomPreviousRow: boolean;
  canZoomNextRow: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: any) => boolean;
  fetchTableFks: (id: number) => void;
  loadObjectDetailFKReferences: (opts: { objectId: ObjectId }) => void;
  followForeignKey: (opts: { objectId: ObjectId; fk: ForeignKey }) => void;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
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
  canZoom,
  canZoomPreviousRow,
  canZoomNextRow,
  onVisualizationClick,
  visualizationIsClickable,
  fetchTableFks,
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
}: ObjectDetailProps): JSX.Element | null {
  const [hasNotFoundError, setHasNotFoundError] = useState(false);
  const prevData = usePrevious(data);
  const prevTableForeignKeys = usePrevious(tableForeignKeys);

  const loadFKReferences = useCallback(() => {
    if (zoomedRowID) {
      loadObjectDetailFKReferences({ objectId: zoomedRowID });
    }
  }, [zoomedRowID, loadObjectDetailFKReferences]);

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
      loadFKReferences();
    }
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  });

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
      followForeignKey({ objectId: zoomedRowID, fk });
    },
    [zoomedRowID, followForeignKey],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      viewPreviousObjectDetail();
    }
    if (event.key === "ArrowRight") {
      viewNextObjectDetail();
    }
  };

  if (!data) {
    return null;
  }

  if (hasNotFoundError) {
    return <NotFound />;
  }

  const objectName = getObjectName({ table, question });

  return (
    <ObjectDetailWrapper>
      <ObjectDetailHeader
        canZoom={canZoom}
        objectName={objectName}
        objectId={zoomedRowID}
        canZoomPreviousRow={canZoomPreviousRow}
        canZoomNextRow={canZoomNextRow}
        viewPreviousObjectDetail={viewPreviousObjectDetail}
        viewNextObjectDetail={viewNextObjectDetail}
      />
      <ObjectDetailBody
        data={data}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
        tableForeignKeys={tableForeignKeys}
        tableForeignKeyReferences={tableForeignKeyReferences}
        followForeignKey={onFollowForeignKey}
      />
    </ObjectDetailWrapper>
  );
}

export const ObjectDetailWrapper = ({
  children,
}: {
  children: JSX.Element | JSX.Element[];
}) => (
  <div className="scroll-y pt2 px4" data-testid="object-detail">
    <div className="ObjectDetail bordered rounded">{children}</div>
  </div>
);

export interface ObjectDetailHeaderProps {
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId;
  canZoomPreviousRow: boolean;
  canZoomNextRow: boolean;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
}

export function ObjectDetailHeader({
  canZoom,
  objectName,
  objectId,
  canZoomPreviousRow,
  canZoomNextRow,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
}: ObjectDetailHeaderProps): JSX.Element {
  return (
    <div className="Grid border-bottom relative">
      <div className="Grid-cell border-right px4 py3 ml2 arrow-right">
        <div className="text-brand text-bold">
          <span>{objectName}</span>
          <h1>{objectId}</h1>
        </div>
      </div>
      <div className="Grid-cell flex align-center Cell--1of3 bg-alt">
        <div className="p4 flex align-center text-bold text-medium">
          <Icon name="connections" size={17} />
          <div className="ml2">
            {jt`This ${(
              <span className="text-dark" key={objectName}>
                {objectName}
              </span>
            )} is connected to:`}
          </div>
        </div>
      </div>

      {canZoom && (
        <div
          className={cx(
            "absolute left cursor-pointer text-brand-hover lg-ml2",
            { disabled: !canZoomPreviousRow },
          )}
          aria-disabled={!canZoomPreviousRow}
          style={{
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
          data-testid="view-previous-object-detail"
        >
          <DirectionalButton
            direction="left"
            onClick={viewPreviousObjectDetail}
          />
        </div>
      )}
      {canZoom && (
        <div
          className={cx(
            "absolute right cursor-pointer text-brand-hover lg-ml2",
            { disabled: !canZoomNextRow },
          )}
          aria-disabled={!canZoomNextRow}
          style={{
            top: "50%",
            transform: "translate(50%, -50%)",
          }}
          data-testid="view-next-object-detail"
        >
          <DirectionalButton direction="right" onClick={viewNextObjectDetail} />
        </div>
      )}
    </div>
  );
}

export interface ObjectDetailBodyProps {
  data: DatasetData;
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
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
  tableForeignKeys,
  tableForeignKeyReferences,
  followForeignKey,
}: ObjectDetailBodyProps): JSX.Element {
  return (
    <div className="Grid">
      <div
        className="Grid-cell p4"
        style={{ marginLeft: "2.4rem", fontSize: "1rem" }}
      >
        <DetailsTable
          data={data}
          zoomedRow={zoomedRow}
          settings={settings}
          onVisualizationClick={onVisualizationClick}
          visualizationIsClickable={visualizationIsClickable}
        />
      </div>
      <div className="Grid-cell Cell--1of3 bg-alt">
        <Relationships
          tableForeignKeys={tableForeignKeys}
          tableForeignKeyReferences={tableForeignKeyReferences}
          foreignKeyClicked={followForeignKey}
        />
      </div>
    </div>
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
