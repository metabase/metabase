import cx from "classnames";
import { type ReactNode, useState } from "react";
import { useTimeout } from "react-use";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import type { NavigateToNewCardParams } from "embedding-sdk-bundle/types";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { isMac } from "metabase/lib/browser";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { getWhiteLabeledLoadingMessageFactory } from "metabase/selectors/whitelabel";
import { Box, Flex, Stack, Text, Title } from "metabase/ui";
import type {
  ClickActionsMode,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import type { Dataset, DatasetColumn, RawSeries } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import type { QueryBuilderMode } from "metabase-types/store";

import { RunButtonWithTooltip } from "./RunButtonWithTooltip";
import { VisualizationError } from "./VisualizationError";
import { VisualizationResult } from "./VisualizationResult";
import { Warnings } from "./Warnings";

const SLOW_MESSAGE_TIMEOUT = 4000;

type QueryVisualizationProps = {
  className?: string;
  question: Question;
  isRunnable?: boolean;
  isRunning?: boolean;
  isObjectDetail?: boolean;
  isDirty?: boolean;
  isResultDirty?: boolean;
  isNativeEditorOpen?: boolean;
  isDirtyStateShownForError?: boolean;
  runQuestionQuery?: () => void;
  cancelQuery?: () => void;
  queryBuilderMode?: QueryBuilderMode;
  result?: Dataset | Pick<Dataset, "error" | "error_type"> | null;
  rawSeries?: RawSeries | null;
  maxTableRows?: number;
  navigateToNewCardInsideQB?:
    | ((params: NavigateToNewCardParams) => Promise<void>)
    | null;
  onNavigateBack?: () => void;
  onHeaderColumnReorder?: (colIndex: number) => void;
  onUpdateQuestion?: () => void;
  isShowingDetailsOnlyColumns?: boolean;
  hasMetadataPopovers?: boolean;
  handleVisualizationClick?: (clicked: {
    element: unknown;
    column: DatasetColumn;
  }) => void;
  tableHeaderHeight?: number;
  renderTableHeader?: (
    column: DatasetColumn,
    columnIndex: number,
  ) => JSX.Element;
  noHeader?: boolean;
  mode?: QueryClickActionsMode | ClickActionsMode | null | undefined;
  token?: EntityToken | null | undefined;
  scrollToColumn?: number;
  renderEmptyMessage?: boolean;
};

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
    maxTableRows = HARD_ROW_LIMIT,
  } = props;

  const canRun = Lib.canRun(question.query(), question.type());
  const [warnings, setWarnings] = useState<string[]>([]);
  const isDirtyStateShown =
    canRun &&
    isResultDirty &&
    isRunnable &&
    !isRunning &&
    !isNativeEditorOpen &&
    (result?.error == null ||
      isDirtyStateShownForError ||
      result.error_type === SERVER_ERROR_TYPES.missingRequiredParameter);

  return (
    <div
      className={cx(className, CS.relative, CS.stackingContext, CS.fullHeight)}
    >
      {isRunning ? (
        <VisualizationRunningState className={cx(CS.spread, CS.z2)} />
      ) : null}
      <VisualizationDirtyState
        {...props}
        hidden={!isDirtyStateShown}
        className={cx(CS.spread, CS.z2)}
      />
      {!isObjectDetail && (
        <Warnings
          warnings={warnings}
          className={cx(CS.absolute, CS.top, CS.right, CS.mt2, CS.mr2, CS.z2)}
          size={18}
        />
      )}
      <div
        className={cx(
          CS.spread,
          QueryBuilderS.Visualization,
          {
            [QueryBuilderS.VisualizationLoading]: isRunning,
          },
          CS.z1,
        )}
        data-testid="query-visualization-root"
      >
        {result?.error ? (
          <VisualizationError
            className={CS.spread}
            error={result.error}
            errorType={result.error_type}
            via={result.via}
            question={question}
            duration={result.duration}
          />
        ) : result?.data ? (
          <VisualizationResult
            {...props}
            result={result as Dataset}
            rawSeries={props.rawSeries ?? undefined}
            maxTableRows={maxTableRows}
            className={CS.spread}
            onUpdateWarnings={setWarnings}
          />
        ) : !isRunning && !isDirtyStateShown ? (
          <VisualizationEmptyState>
            {t`Here's where your results will appear`}
          </VisualizationEmptyState>
        ) : null}
      </div>
    </div>
  );
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

export function VisualizationRunningState({ className = "" }) {
  const [isSlow] = useTimeout(SLOW_MESSAGE_TIMEOUT);

  const getLoadingMessage = useSelector(getWhiteLabeledLoadingMessageFactory);

  // show the slower loading message only when the loadingMessage is
  // not customized
  const message = getLoadingMessage(isSlow() ?? false);

  return (
    <Flex
      className={cx(className, QueryBuilderS.Overlay)}
      c="brand"
      direction="column"
      justify="center"
      align="center"
    >
      <LoadingSpinner />
      <Title c="brand" order={3} mt="lg">
        {message}
      </Title>
    </Flex>
  );
}

export const VisualizationDirtyState = ({
  className,
  isRunning,
  isResultDirty,
  runQuestionQuery,
  cancelQuery,
  hidden,
}: {
  className?: string;
  isRunning?: boolean;
  isResultDirty?: boolean;
  runQuestionQuery: () => void;
  cancelQuery: () => void;
  hidden?: boolean;
}) => {
  const keyboardShortcut = getRunQueryShortcut();

  const handleClick = () => {
    if (!hidden) {
      if (isRunning) {
        cancelQuery();
      } else {
        runQuestionQuery();
      }
    }
  };

  return (
    <Flex
      className={cx(className, QueryBuilderS.Overlay, {
        [QueryBuilderS.OverlayActive]: !hidden,
        [QueryBuilderS.OverlayHidden]: hidden,
      })}
      direction="column"
      justify="center"
      align="center"
      gap="sm"
      data-testid="run-button-overlay"
      onClick={handleClick}
    >
      <RunButtonWithTooltip
        className={CS.shadowed}
        iconSize={32}
        circular
        hidden={hidden}
        isRunning={isRunning}
        isDirty={isResultDirty}
      />
      {!hidden && <Text c="text-secondary">{keyboardShortcut}</Text>}
    </Flex>
  );
};

function getRunQueryShortcut() {
  return isMac() ? t`⌘ + return` : t`Ctrl + enter`;
}
