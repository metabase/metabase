import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { isAbortError } from "metabase/api/client";
import {
  useQuestionFromCard,
  useQuestionFromCardBuilder,
} from "metabase/metadata-store";
import { runQuestionQuery } from "metabase/querying/run-query";
import { syncVizSettingsWithSeries } from "metabase/querying/viz-settings/utils/sync-viz-settings";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch } from "metabase/redux";
import { createRawSeries, getSensibleDisplays } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dataset,
  DatasetQuery,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { computeQuestionPivotTable } from "../../actions/core/pivot-table";
import { getAdHocQuestionWithVizSettings } from "../../utils/viz-settings";

type QueryRun = {
  result: Dataset | null;
  lastRunQuery: DatasetQuery | null;
  /** A failure the query endpoint threw rather than returned as a result. */
  error: unknown;
  isRunning: boolean;
};

const NO_RUN: QueryRun = {
  result: null,
  lastRunQuery: null,
  error: null,
  isRunning: false,
};

type SourceSnapshot = { card: Card; run: QueryRun };

/**
 * Settles the display and settings of a question whose query just returned, as the query
 * builder's `queryCompleted` does.
 */
function getCompletedQuestion(
  question: Question,
  result: Dataset,
  previousSeries: RawSeries | null,
): Question {
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if (!isEditable || result.data == null) {
    return question;
  }
  const series: RawSeries = [{ card: question.card(), data: result.data }];
  const settledQuestion =
    previousSeries != null
      ? question.setSettings(
          syncVizSettingsWithSeries(
            question.settings(),
            question.query(),
            series,
            previousSeries,
          ),
        )
      : question;
  return settledQuestion.maybeResetDisplay(
    result.data,
    getSensibleDisplays(series),
    previousSeries != null ? getSensibleDisplays(previousSeries) : undefined,
  );
}

/**
 * A local stand-in for the query builder's question state: the question, its last results, and
 * the `updateQuestion` / run / cancel behavior the query builder applies on every change.
 * Starts from `sourceCard` and runs it on mount.
 */
export function usePrototypeQuestion(sourceCard: Card) {
  const dispatch = useDispatch();
  const buildQuestion = useQuestionFromCardBuilder();
  const [card, setCard] = useState<Card>(sourceCard);
  const [run, setRun] = useState<QueryRun>(NO_RUN);
  const question = useQuestionFromCard(card);

  const rawSeries = useMemo(
    () =>
      createRawSeries({
        card,
        queryResult: run.result,
        datasetQuery: run.lastRunQuery,
      }),
    [card, run.result, run.lastRunQuery],
  );

  // async callbacks compare against what is current when they resolve, not when they started
  const latestRef = useRef({ question, card, run, rawSeries });
  latestRef.current = { question, card, run, rawSeries };
  const abortControllerRef = useRef<AbortController | null>(null);
  const sourceSnapshotRef = useRef<SourceSnapshot | null>(null);
  // bumped by every update, so one that waited on metadata doesn't run after a newer one
  const updateCountRef = useRef(0);

  const runQuestion = useCallback(
    async (questionToRun: Question) => {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setRun((currentRun) => ({ ...currentRun, error: null, isRunning: true }));

      try {
        const [result] = await runQuestionQuery(questionToRun, {
          dispatch,
          signal: abortController.signal,
          isDirty: true,
        });
        if (abortController.signal.aborted) {
          return;
        }
        // a newer update that didn't run its query (e.g. it was waiting on metadata) owns the
        // question now: settling this older one would hand the sidebar a question it didn't make
        if (
          !Lib.areLegacyQueriesEqual(
            questionToRun.datasetQuery(),
            latestRef.current.card.dataset_query,
          )
        ) {
          setRun((currentRun) => ({ ...currentRun, isRunning: false }));
          return;
        }
        const completedCard = getCompletedQuestion(
          questionToRun,
          result,
          latestRef.current.rawSeries,
        ).card();
        const completedRun: QueryRun = {
          result,
          lastRunQuery: questionToRun.datasetQuery(),
          error: null,
          isRunning: false,
        };
        if (
          sourceSnapshotRef.current == null &&
          Lib.areLegacyQueriesEqual(
            questionToRun.datasetQuery(),
            sourceCard.dataset_query,
          )
        ) {
          sourceSnapshotRef.current = {
            card: completedCard,
            run: completedRun,
          };
        }
        setCard(completedCard);
        setRun(completedRun);
      } catch (error) {
        if (isAbortError(error) || abortController.signal.aborted) {
          return;
        }
        setRun({ ...NO_RUN, error });
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [dispatch, sourceCard],
  );

  /** Mirrors the query builder's `updateQuestion` thunk for an ad-hoc structured question. */
  const updateQuestion = useCallback(
    async (newQuestion: Question, { run = false }: { run?: boolean } = {}) => {
      const updateCount = ++updateCountRef.current;
      const { question: currentQuestion, rawSeries: currentRawSeries } =
        latestRef.current;

      let nextQuestion = getAdHocQuestionWithVizSettings({
        question: newQuestion,
        currentQuestion,
        shouldStartAdHocQuestion: true,
      });
      let shouldRun = run && nextQuestion.canAutoRun();

      const computedPivotQuestion = computeQuestionPivotTable({
        question: nextQuestion,
        currentQuestion,
        rawSeries: currentRawSeries ?? undefined,
      });
      nextQuestion = computedPivotQuestion.question;
      if (computedPivotQuestion.shouldRun !== null) {
        const lastRunQuery = currentRawSeries?.[0]?.card.dataset_query;
        const hasStaleResults =
          lastRunQuery == null ||
          !Lib.areLegacyQueriesEqual(nextQuestion.datasetQuery(), lastRunQuery);
        shouldRun =
          computedPivotQuestion.shouldRun || (shouldRun && hasStaleResults);
      }

      nextQuestion = nextQuestion.applyTemplateTagParameters();
      setCard(nextQuestion.card());

      const currentDependencies = Lib.dependentMetadata(
        currentQuestion.query(),
        currentQuestion.id(),
        currentQuestion.type(),
      );
      const nextDependencies = Lib.dependentMetadata(
        nextQuestion.query(),
        nextQuestion.id(),
        nextQuestion.type(),
      );
      if (!_.isEqual(currentDependencies, nextDependencies)) {
        await dispatch(loadMetadataForCard(nextQuestion.card()));
      }
      if (shouldRun && updateCount === updateCountRef.current) {
        runQuestion(nextQuestion);
      }
    },
    [dispatch, runQuestion],
  );

  const updateVisualizationSettings = useCallback(
    (settings: Partial<VisualizationSettings>) => {
      updateQuestion(latestRef.current.question.updateSettings(settings));
    },
    [updateQuestion],
  );

  const rerun = useCallback(() => {
    runQuestion(latestRef.current.question);
  }, [runQuestion]);

  const cancelQuery = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setRun((currentRun) => ({ ...currentRun, isRunning: false }));
  }, []);

  /** Back to the unsummarized source question, reusing its first results when there are any. */
  const resetToSource = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const snapshot = sourceSnapshotRef.current;
    if (snapshot != null) {
      setCard(snapshot.card);
      setRun(snapshot.run);
    } else {
      setCard(sourceCard);
      runQuestion(buildQuestion(sourceCard));
    }
  }, [buildQuestion, runQuestion, sourceCard]);

  useEffect(() => {
    // a sidebar that summarizes as it mounts has already started its own run, which this would abort
    if (abortControllerRef.current == null) {
      runQuestion(buildQuestion(sourceCard));
    }
    return () => abortControllerRef.current?.abort();
    // runs the source once per mount; later changes go through `updateQuestion`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isResultDirty =
    run.lastRunQuery == null ||
    !Lib.areLegacyQueriesEqual(question.datasetQuery(), run.lastRunQuery);

  return {
    question,
    result: run.result,
    rawSeries,
    error: run.error,
    isRunning: run.isRunning,
    isRunnable: Lib.canRun(question.query(), question.type()),
    isResultDirty,
    updateQuestion,
    updateVisualizationSettings,
    rerun,
    cancelQuery,
    resetToSource,
  };
}
