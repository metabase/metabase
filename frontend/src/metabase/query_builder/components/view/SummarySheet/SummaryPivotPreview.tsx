import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetAdhocPivotQueryQuery } from "metabase/api/dataset";
import { Box, Center, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import { getDatasetError, getGenericErrorMessage } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import S from "./SummarySheet.module.css";
import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryDragItem,
  SummaryWellId,
} from "./types";
import { canDropOnWell, getPivotConfig } from "./utils";

type SummaryPivotPreviewProps = {
  question: Question;
  base: SummaryBase;
  definition: SummaryDefinition;
  summaryQuery: Lib.Query | null;
  itemLabels: Map<string, string>;
  draggedItem: SummaryDragItem | null;
};

/** The pivot table for the summary, or a pivot-shaped skeleton until it has a grouping and a value. */
export function SummaryPivotPreview({
  question,
  base,
  definition,
  summaryQuery,
  itemLabels,
  draggedItem,
}: SummaryPivotPreviewProps) {
  const hasDimensions =
    definition.rows.length > 0 || definition.columns.length > 0;
  const hasValues = definition.values.length > 0;

  return (
    <>
      {summaryQuery == null && (
        <Text c="text-secondary" p="md">
          {t`Some fields in this summary are no longer available. Remove them to continue.`}
        </Text>
      )}
      {summaryQuery != null && hasDimensions && hasValues ? (
        <SummaryPivotResult
          question={question}
          stageIndex={base.stageIndex}
          definition={definition}
          summaryQuery={summaryQuery}
        />
      ) : (
        <SummaryPivotSkeleton
          definition={definition}
          itemLabels={itemLabels}
          draggedItem={draggedItem}
        />
      )}
    </>
  );
}

type SummaryPivotResultProps = {
  question: Question;
  stageIndex: number;
  definition: SummaryDefinition;
  summaryQuery: Lib.Query;
};

function SummaryPivotResult({
  question,
  stageIndex,
  definition,
  summaryQuery,
}: SummaryPivotResultProps) {
  const { card, request } = useMemo(() => {
    const { columnSplit, pivotRows, pivotCols } = getPivotConfig(
      summaryQuery,
      stageIndex,
      definition,
    );
    const summaryQuestion = Question.create({
      metadata: question.metadata(),
      dataset_query: Lib.toJsQuery(summaryQuery),
      display: "pivot",
      visualization_settings: { "pivot_table.column_split": columnSplit },
    });
    return {
      card: summaryQuestion.card(),
      request: {
        ...summaryQuestion.datasetQuery(),
        pivot_rows: pivotRows,
        pivot_cols: pivotCols,
        show_row_totals: true,
        show_column_totals: true,
      },
    };
  }, [question, stageIndex, definition, summaryQuery]);

  const {
    data: dataset,
    error,
    isFetching,
  } = useGetAdhocPivotQueryQuery(request);

  const rawSeries = useMemo(
    () => (dataset ? [{ card, data: dataset.data }] : null),
    [card, dataset],
  );
  const chartError =
    (dataset ? getDatasetError(dataset) : undefined) ??
    (error
      ? { message: getGenericErrorMessage(), icon: "warning" as const }
      : undefined);

  return (
    <Box className={S.result} data-testid="summary-pivot-result">
      {chartError ? (
        <Center h="100%">
          <ErrorView error={chartError.message} icon={chartError.icon} />
        </Center>
      ) : rawSeries ? (
        <Visualization
          className={S.result}
          rawSeries={rawSeries}
          isQueryBuilder={false}
          showTitle={false}
        />
      ) : null}
      {isFetching && (
        <Box className={S.resultLoadingOverlay}>
          <Loader />
        </Box>
      )}
    </Box>
  );
}

type SummaryPivotSkeletonProps = {
  definition: SummaryDefinition;
  itemLabels: Map<string, string>;
  draggedItem: SummaryDragItem | null;
};

const SKELETON_COLUMN_COUNT = 4;
const SKELETON_ROW_COUNT = 6;

function SummaryPivotSkeleton({
  definition,
  itemLabels,
  draggedItem,
}: SummaryPivotSkeletonProps) {
  const getLabels = (items: SummaryDimension[] | SummaryDefinition["values"]) =>
    items.map(({ id }) => itemLabels.get(id) ?? "");
  const rowLabels = getLabels(definition.rows);
  const columnLabels = getLabels(definition.columns);
  const valueLabels = getLabels(definition.values);

  return (
    <Box className={S.skeleton} data-testid="summary-pivot-skeleton">
      <Box className={S.skeletonCorner} />
      <SkeletonZone
        wellId="columns"
        className={S.skeletonColumns}
        title={t`Columns`}
        definition={definition}
        draggedItem={draggedItem}
      >
        <Box className={S.skeletonHeaderCells}>
          {_.range(SKELETON_COLUMN_COUNT).map((index) => (
            <SkeletonCell key={index} label={columnLabels[index]} />
          ))}
        </Box>
      </SkeletonZone>
      <SkeletonZone
        wellId="rows"
        className={S.skeletonRows}
        title={t`Rows`}
        definition={definition}
        draggedItem={draggedItem}
      >
        <Box className={S.skeletonRowCells}>
          {_.range(SKELETON_ROW_COUNT).map((index) => (
            <SkeletonCell key={index} label={rowLabels[index]} />
          ))}
        </Box>
      </SkeletonZone>
      <SkeletonZone
        wellId="values"
        className={S.skeletonValues}
        title={t`Values`}
        definition={definition}
        draggedItem={draggedItem}
      >
        <Box className={S.skeletonValueCells}>
          {_.range(SKELETON_COLUMN_COUNT * SKELETON_ROW_COUNT).map((index) => (
            <SkeletonCell
              key={index}
              label={valueLabels[index % SKELETON_COLUMN_COUNT]}
            />
          ))}
        </Box>
      </SkeletonZone>
    </Box>
  );
}

type SkeletonZoneProps = {
  wellId: SummaryWellId;
  className: string;
  title: string;
  definition: SummaryDefinition;
  draggedItem: SummaryDragItem | null;
  children: ReactNode;
};

function SkeletonZone({
  wellId,
  className,
  title,
  definition,
  draggedItem,
  children,
}: SkeletonZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `summary-preview:${wellId}`,
    data: { wellId },
  });
  const canDrop =
    draggedItem != null && canDropOnWell(draggedItem, wellId, definition);

  return (
    <Box
      ref={setNodeRef}
      className={cx(className, { [S.skeletonZoneIsOver]: canDrop && isOver })}
    >
      <Text className={S.skeletonZoneTitle}>{title}</Text>
      {children}
    </Box>
  );
}

function SkeletonCell({ label }: { label?: string }) {
  return (
    <Box className={cx(S.skeletonCell, { [S.skeletonCellFilled]: label })}>
      {label}
    </Box>
  );
}
