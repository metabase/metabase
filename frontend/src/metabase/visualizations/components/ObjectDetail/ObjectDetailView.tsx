import { useCallback, useEffect, useMemo, useState } from "react";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import type { ConcreteTableId, DatasetData } from "metabase-types/api";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { NotFound } from "metabase/containers/ErrorPages";
import { MetabaseApi } from "metabase/services";
import { isPK } from "metabase-lib/types/utils/isa";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import type ForeignKey from "metabase-lib/metadata/ForeignKey";

import { ObjectDetailBody } from "./ObjectDetailBody";
import { ObjectDetailHeader } from "./ObjectDetailHeader";
import {
  ErrorWrapper,
  ObjectDetailContainer,
  ObjectDetailWrapperDiv,
} from "./ObjectDetailView.styled";
import type { ObjectDetailProps } from "./types";
import { getDisplayId, getObjectName, getSinglePKIndex } from "./utils";

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
