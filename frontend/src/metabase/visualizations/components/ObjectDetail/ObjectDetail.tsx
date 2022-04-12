import React, { useState, useEffect } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import cx from "classnames";

import Question from "metabase-lib/lib/Question";
import { Table } from "metabase-types/types/Table";
import { ForeignKey } from "metabase-types/api/foreignKey";
import { DatasetData } from "metabase-types/types/Dataset";
import { OnVisualizationClickType } from "./types";

import DirectionalButton from "metabase/components/DirectionalButton";
import Icon from "metabase/components/Icon";
import { NotFound } from "metabase/containers/ErrorPages";
import { usePrevious } from "metabase/hooks/use-previous";

import { getObjectName, getIdValue } from "./utils";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";

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

const mapStateToProps = (state: any) => ({
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
});

export interface ObjectDetailProps {
  data: DatasetData;
  question: Question;
  table: Table | null;
  zoomedRow: unknown[] | undefined;
  zoomedRowID: number;
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
}: ObjectDetailProps): JSX.Element | null {
  const [hasNotFoundError, setHasNotFoundError] = useState(false);
  const prevData = usePrevious(data);
  const prevTableForeignKeys = usePrevious(tableForeignKeys);

  useEffect(() => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const canZoom = !!zoomedRow;
  const objectName = getObjectName({ table, question });

  return (
    <ObjectDetailWrapper>
      <ObjectDetailHeader
        canZoom={canZoom}
        objectName={objectName}
        objectId={getIdValue({ data, zoomedRowID })}
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
        followForeignKey={followForeignKey}
      />
    </ObjectDetailWrapper>
  );
}

export const ObjectDetailWrapper = ({
  children,
}: {
  children: JSX.Element | JSX.Element[];
}) => (
  <div className="scroll-y pt2 px4">
    <div className="ObjectDetail bordered rounded">{children}</div>
  </div>
);

export interface ObjectDetailHeaderProps {
  canZoom: boolean;
  objectName: string;
  objectId: number | null;
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
  zoomedRow: any[] | undefined;
  settings: any;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: any) => boolean;
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
