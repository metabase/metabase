import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import { Warnings } from "metabase/common/components/Warnings";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import {
  LOADING_SPINNER_DELAY_MS,
  usePrototypeSetting,
} from "metabase/prototype";
import { Box, Flex, Icon, Stack, Text } from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import { SERVER_ERROR_TYPES } from "metabase/utils/errors";
import { VisualizationRunningState } from "metabase/visualizations/components/Visualization/VisualizationRunningState";
import { prefetchVisualizationComponent } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import S from "./QueryVisualization.module.css";
import { useRuntimeEstimateHint } from "./RuntimeEstimate";
import { VisualizationError } from "./VisualizationError";
import { VisualizationResult } from "./VisualizationResult";
import type { QueryVisualizationProps } from "./types";

export function QueryVisualization(props: QueryVisualizationProps) {
  const {
    className,
    question,
    isRunnable,
    isRunning,
    isObjectDetail,
    isResultDirty,
    isNativeEditorOpen,
    isDirtyStateShownForError,
    result,
    errorAction,
    maxTableRows = HARD_ROW_LIMIT,
  } = props;

  const canRun = Lib.canRun(question.query(), question.type());
  const [spinnerDelayMs] = usePrototypeSetting(LOADING_SPINNER_DELAY_MS);
  const isSpinnerShown = useIsRunningLong(Boolean(isRunning), spinnerDelayMs);
  const estimateHint = useRuntimeEstimateHint(question, Boolean(isRunning));
  const [warnings, setWarnings] = useState<string[]>([]);

  // The result is not rendered until the query returns, so the chart chunk
  // would only start downloading then. Start it from the display alone, so it
  // loads in parallel with the query.
  const display = question.display();
  useEffect(() => {
    prefetchVisualizationComponent(display);
  }, [display]);
  const isDirtyStateShown =
    canRun &&
    isResultDirty &&
    isRunnable &&
    !isRunning &&
    !isNativeEditorOpen &&
    (result?.error == null ||
      isDirtyStateShownForError ||
      result?.error_type === SERVER_ERROR_TYPES.missingRequiredParameter);

  return (
    <Box pos="relative" h="100%" className={cx(className, S.root)}>
      {isSpinnerShown ? (
        <VisualizationRunningState
          className={cx(S.overlay, S.fadeIn)}
          hint={estimateHint}
        />
      ) : null}
      <VisualizationDirtyState
        {...props}
        estimateHint={estimateHint}
        hidden={!isDirtyStateShown}
        className={S.overlay}
      />
      {!isObjectDetail && (
        <Warnings warnings={warnings} className={S.warnings} size={18} />
      )}
      <Box
        className={cx(S.visualization, QueryBuilderS.Visualization, {
          [QueryBuilderS.VisualizationLoading]: isSpinnerShown,
        })}
        data-testid="query-visualization-root"
      >
        {result?.error ? (
          <VisualizationError
            className={S.spread}
            error={result.error}
            errorType={result.error_type}
            question={question}
            duration={result.duration ?? 0}
            errorAction={errorAction}
          />
        ) : result?.data ? (
          <VisualizationResult
            {...props}
            maxTableRows={maxTableRows}
            className={S.spread}
            onUpdateWarnings={setWarnings}
          />
        ) : !isRunning && !isDirtyStateShown ? (
          <VisualizationEmptyState>
            {t`Here's where your results will appear`}
          </VisualizationEmptyState>
        ) : null}
      </Box>
    </Box>
  );
}

// Prototype: fast queries show no spinner, so that it does not flash.
function useIsRunningLong(isRunning: boolean, delayMs: number): boolean {
  const [isLong, setIsLong] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      setIsLong(false);
      return;
    }
    const timeoutId = setTimeout(() => setIsLong(true), delayMs);
    return () => clearTimeout(timeoutId);
  }, [isRunning, delayMs]);

  return isRunning && isLong;
}

const VisualizationEmptyState = ({ children }: { children: ReactNode }) => {
  const keyboardShortcut = getRunQueryShortcut();

  return (
    <Flex w="100%" h="100%" align="center" justify="center">
      <Stack maw="25rem" gap={0} ta="center" align="center">
        <Box maw="3rem" mb="0.75rem">
          <img src={EmptyCodeResult} alt="Code prompt icon" />
        </Box>
        <Text c="text-secondary">
          {c("{0} refers to the keyboard shortcut")
            .jt`To run your code, click on the Run button or type ${(
            <b key="shortcut">({keyboardShortcut})</b>
          )}`}
        </Text>
        <Text c="text-secondary">{children}</Text>
      </Stack>
    </Flex>
  );
};

type VisualizationDirtyStateProps = {
  className?: string;
  isRunning?: boolean;
  isResultDirty?: boolean;
  runQuestionQuery?: () => void;
  cancelQuery?: () => void;
  onResetChanges?: () => void;
  hidden?: boolean;
  estimateHint?: string | null;
};

export const VisualizationDirtyState = ({
  className,
  isRunning,
  runQuestionQuery,
  cancelQuery,
  onResetChanges,
  hidden,
  estimateHint,
}: VisualizationDirtyStateProps) => {
  const keyboardShortcut = getRunQueryShortcut();

  const handleClick = () => {
    if (!hidden) {
      if (isRunning) {
        cancelQuery?.();
      } else {
        runQuestionQuery?.();
      }
    }
  };

  return (
    <Flex
      className={cx(className, QueryBuilderS.Overlay, {
        [QueryBuilderS.OverlayActive]: !hidden,
        [QueryBuilderS.OverlayHidden]: hidden,
        [S.dirtyTint]: !hidden,
      })}
      direction="column"
      justify="center"
      align="center"
      gap="sm"
      data-testid="run-button-overlay"
    >
      {/* Prototype: a larger run button with the shortcut inside, on a
          tinted result. */}
      {!hidden && (
        <button
          className={S.runPill}
          aria-label={t`Refresh`}
          data-testid="run-button"
          onClick={handleClick}
        >
          <Icon name="play" size={20} />
          {t`Run`}
          <span className={S.runPillShortcut}>{keyboardShortcut}</span>
          {estimateHint != null && (
            <span className={S.runPillHint}>{estimateHint}</span>
          )}
        </button>
      )}
      {!hidden && onResetChanges != null && (
        <button className={S.resetButton} onClick={onResetChanges}>
          {t`Reset changes instead`}
        </button>
      )}
    </Flex>
  );
};

function getRunQueryShortcut() {
  return isMac() ? t`⌘ + Return` : t`Ctrl + Enter`;
}
