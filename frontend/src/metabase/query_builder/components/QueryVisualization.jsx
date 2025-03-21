/* eslint-disable react/prop-types */
import cx from "classnames";
import { useState } from "react";
import { useTimeout } from "react-use";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { isMac } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import { getWhiteLabeledLoadingMessageFactory } from "metabase/selectors/whitelabel";
import { Box, Flex, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import RunButtonWithTooltip from "./RunButtonWithTooltip";
import { VisualizationError } from "./VisualizationError";
import VisualizationResult from "./VisualizationResult";
import Warnings from "./Warnings";

const SLOW_MESSAGE_TIMEOUT = 4000;

export default function QueryVisualization(props) {
  const {
    className,
    question,
    isRunning,
    isObjectDetail,
    isResultDirty,
    isNativeEditorOpen,
    result,
    maxTableRows = HARD_ROW_LIMIT,
  } = props;

  const canRun = Lib.canRun(question.query(), question.type());
  const [warnings, setWarnings] = useState([]);

  return (
    <div
      className={cx(className, CS.relative, CS.stackingContext, CS.fullHeight)}
    >
      {isRunning ? (
        <VisualizationRunningState className={cx(CS.spread, CS.z2)} />
      ) : null}
      <VisualizationDirtyState
        {...props}
        hidden={
          !canRun ||
          !isResultDirty ||
          isRunning ||
          isNativeEditorOpen ||
          result?.error
        }
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
            via={result.via}
            question={question}
            duration={result.duration}
          />
        ) : result?.data ? (
          <VisualizationResult
            {...props}
            maxTableRows={maxTableRows}
            className={CS.spread}
            onUpdateWarnings={setWarnings}
          />
        ) : !isRunning ? (
          <VisualizationEmptyState
            className={CS.spread}
            isCompact={isNativeEditorOpen}
          />
        ) : null}
      </div>
    </div>
  );
}

const VisualizationEmptyState = ({ isCompact }) => {
  const keyboardShortcut = getRunQueryShortcut();

  return (
    <Flex
      w="100%"
      h="100%"
      align={isCompact ? "flex-start" : "center"}
      justify="center"
      mt={isCompact ? "3rem" : "auto"}
    >
      <Stack maw="25rem" gap={0} ta="center" align="center">
        <Box maw="3rem" mb="0.75rem">
          <img src={EmptyCodeResult} alt="Code prompt icon" />
        </Box>
        <Text c="text-medium">
          {c("{0} refers to the keyboard shortcut")
            .jt`To run your code, click on the Run button or type ${(
            <b key="shortcut">({keyboardShortcut})</b>
          )}`}
        </Text>
        <Text c="text-medium">{t`Query results will appear here.`}</Text>
      </Stack>
    </Flex>
  );
};

export function VisualizationRunningState({ className = "" }) {
  const [isSlow] = useTimeout(SLOW_MESSAGE_TIMEOUT);

  const getLoadingMessage = useSelector(getWhiteLabeledLoadingMessageFactory);

  // show the slower loading message only when the loadingMessage is
  // not customized
  const message = getLoadingMessage(isSlow());

  return (
    <div
      className={cx(
        className,
        QueryBuilderS.Loading,
        CS.flex,
        CS.flexColumn,
        CS.layoutCentered,
        CS.textBrand,
      )}
    >
      <LoadingSpinner />
      <h2 className={cx(CS.textBrand, CS.textUppercase, CS.my3)}>{message}</h2>
    </div>
  );
}

export const VisualizationDirtyState = ({
  className,
  result,
  isRunnable,
  isRunning,
  isResultDirty,
  runQuestionQuery,
  cancelQuery,
  hidden,
}) => {
  const isEnabled = isRunnable && !hidden;
  const keyboardShortcut = getRunQueryShortcut();

  const handleClick = () => {
    if (isEnabled) {
      if (isRunning) {
        cancelQuery();
      } else {
        runQuestionQuery();
      }
    }
  };

  return (
    <div
      className={cx(
        className,
        QueryBuilderS.Loading,
        CS.flex,
        CS.flexColumn,
        CS.layoutCentered,
        CS.cursorPointer,
        { [QueryBuilderS.LoadingHidden]: hidden },
      )}
      onClick={handleClick}
    >
      <Stack gap="sm" align="center">
        <RunButtonWithTooltip
          className={CS.shadowed}
          circular
          compact
          result={result}
          hidden={!isEnabled}
          isRunning={isRunning}
          isDirty={isResultDirty}
        />
        {isEnabled && <Text c="text-medium">{keyboardShortcut}</Text>}
      </Stack>
    </div>
  );
};

function getRunQueryShortcut() {
  return isMac() ? t`⌘ + return` : t`Ctrl + Enter`;
}
