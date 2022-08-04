import React, { useState, useEffect, useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Question from "metabase-lib/lib/Question";
import { isPK } from "metabase/lib/schema_metadata";
import Table from "metabase-lib/lib/metadata/Table";

import { State } from "metabase-types/store";
import { ForeignKey } from "metabase-types/api";
import { Column, DatasetData } from "metabase-types/types/Dataset";
import { ObjectId, OnVisualizationClickType } from "./types";

import Button from "metabase/core/components/Button";
import { NotFound } from "metabase/containers/ErrorPages";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { usePrevious } from "metabase/hooks/use-previous";

import {
  isMetric,
  isDimension,
  isNumber,
  isURL,
  isEmail,
  isImageURL,
  isAvatarURL,
} from "metabase/lib/schema_metadata";
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
import { findColumnIndexForColumnSetting } from "metabase/lib/dataset";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";

import { makeDetailBackgroundGetter } from "metabase/visualizations/lib/table_format";
import ChartSettingsTableFormatting, {
  isFormattable,
} from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";

import {
  getObjectName,
  getDisplayId,
  getIdValue,
  getSingleResultsRow,
} from "./utils";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";
import {
  CenteredLayout,
  RootModal,
  ObjectDetailModal,
  ObjectDetailBodyWrapper,
  ObjectIdLabel,
  CloseButton,
  ErrorWrapper,
} from "./ObjectDetail.styled";

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
  canZoom: boolean;
  canZoomPreviousRow: boolean;
  canZoomNextRow: boolean;
  showActions?: boolean;
  showRelations?: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: any) => boolean;
  fetchTableFks: (id: number) => void;
  loadObjectDetailFKReferences: (opts: { objectId: ObjectId }) => void;
  followForeignKey: (opts: { objectId: ObjectId; fk: ForeignKey }) => void;
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
  canZoom,
  canZoomPreviousRow,
  canZoomNextRow,
  showActions = true,
  showRelations = true,
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
      followForeignKey({ objectId: zoomedRowID, fk });
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

  const displayId = getDisplayId({ cols: data.cols, zoomedRow });
  const hasPk = !!data.cols.find(isPK);
  const hasRelationships =
    showRelations && !!(tableForeignKeys && !!tableForeignKeys.length && hasPk);

  return (
    <ObjectDetailModal wide={hasRelationships}>
      {hasNotFoundError ? (
        <ErrorWrapper>
          <NotFound />
        </ErrorWrapper>
      ) : (
        <div className="ObjectDetail" data-testid="object-detail">
          <ObjectDetailHeader
            canZoom={canZoom && (canZoomNextRow || canZoomPreviousRow)}
            objectName={objectName}
            objectId={displayId}
            canZoomPreviousRow={canZoomPreviousRow}
            canZoomNextRow={canZoomNextRow}
            showActions={showActions}
            viewPreviousObjectDetail={viewPreviousObjectDetail}
            viewNextObjectDetail={viewNextObjectDetail}
            closeObjectDetail={closeObjectDetail}
          />
          <ObjectDetailBodyWrapper>
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
          </ObjectDetailBodyWrapper>
        </div>
      )}
    </ObjectDetailModal>
  );
}

function ObjectDetailWrapper({
  question,
  isDataApp,
  data,
  closeObjectDetail,
  ...props
}: ObjectDetailProps & { isDataApp?: boolean }) {
  if (isDataApp || question.display() === "object") {
    if (data.rows.length > 1) {
      return (
        <CenteredLayout>
          <h3>{t`Too many rows for a detail view`}</h3>
        </CenteredLayout>
      );
    }

    return (
      <ObjectDetailFn
        {...props}
        data={data}
        question={question}
        showActions={false}
        showRelations={false}
        closeObjectDetail={closeObjectDetail}
      />
    );
  }
  return (
    <RootModal
      isOpen
      full={false}
      onClose={closeObjectDetail}
      className={""} // need an empty className to override the Modal default width
    >
      <ObjectDetailFn
        {...props}
        data={data}
        question={question}
        closeObjectDetail={closeObjectDetail}
      />
    </RootModal>
  );
}

export interface ObjectDetailHeaderProps {
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null | unknown;
  canZoomPreviousRow: boolean;
  canZoomNextRow: boolean;
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
    <div className="Grid border-bottom relative">
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
                data-testId="object-detail-close-button"
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
    </div>
  );
}

export interface ObjectDetailBodyProps {
  data: DatasetData;
  objectName: string;
  zoomedRow: unknown[];
  settings: unknown;
  hasRelationships: boolean;
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
  hasRelationships = false,
  onVisualizationClick,
  visualizationIsClickable,
  tableForeignKeys,
  tableForeignKeyReferences,
  followForeignKey,
}: ObjectDetailBodyProps): JSX.Element {
  return (
    <>
      <DetailsTable
        data={data}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
      />
      {hasRelationships && (
        <Relationships
          objectName={objectName}
          tableForeignKeys={tableForeignKeys}
          tableForeignKeyReferences={tableForeignKeyReferences}
          foreignKeyClicked={followForeignKey}
        />
      )}
    </>
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
    // NOTE: table column settings may be identified by fieldRef (possible not normalized) or column name:
    //   { name: "COLUMN_NAME", enabled: true }
    //   { fieldRef: ["field", 2, {"source-field": 1}], enabled: true }
    "detail.columns": {
      section: t`Columns`,
      title: t`Visible columns`,
      widget: ChartSettingOrderedColumns,
      getHidden: () => false,
      isValid: ([{ card, data }]: any) =>
        // If "detail.columns" happened to be an empty array,
        // it will be treated as "all columns are hidden",
        // This check ensures it's not empty,
        // otherwise it will be overwritten by `getDefault` below
        card.visualization_settings["detail.columns"].length !== 0 &&
        _.all(
          card.visualization_settings["detail.columns"],
          columnSetting =>
            findColumnIndexForColumnSetting(data.cols, columnSetting) >= 0,
        ),
      getDefault: ([
        {
          data: { cols },
        },
      ]: any) =>
        cols.map((col: any) => ({
          name: col.name,
          fieldRef: col.field_ref,
          enabled: col.visibility_type !== "hidden",
        })),
      getProps: ([
        {
          data: { cols },
        },
      ]: any) => ({
        columns: cols,
      }),
    },

    "detail.column_formatting": {
      section: t`Conditional Formatting`,
      widget: ChartSettingsTableFormatting,
      default: [],
      getProps: (series: any) => ({
        cols: series[0].data.cols.filter(isFormattable),
        isDetail: true,
      }),

      getHidden: ([
        {
          data: { cols },
        },
      ]: any) => cols.filter(isFormattable).length === 0,
      readDependencies: [],
    },

    "detail._cell_background_getter": {
      getValue(
        [
          {
            data: { rows, cols },
          },
        ]: any,
        settings: any,
      ) {
        return makeDetailBackgroundGetter(rows, cols, settings);
      },
      readDependencies: ["detail.column_formatting"],
    },
  },
  isSensible: () => true,
};

const ObjectDetail = Object.assign(
  connect(mapStateToProps, mapDispatchToProps)(ObjectDetailWrapper),
  ObjectDetailProperties,
);

export default ObjectDetail;
