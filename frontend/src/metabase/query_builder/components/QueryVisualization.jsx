/* eslint-disable react/prop-types */
import cx from "classnames";
import { useState } from "react";
import { useTimeout } from "react-use";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { useSelector } from "metabase/lib/redux";
import { getWhiteLabeledLoadingMessageFactory } from "metabase/selectors/whitelabel";
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
        hidden={!isResultDirty || isRunning || isNativeEditorOpen}
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
          <VisualizationEmptyState className={CS.spread} />
        ) : null}
      </div>
    </div>
  );
}

export const VisualizationEmptyState = ({ className }) => (
  <div
    className={cx(
      className,
      CS.flex,
      CS.flexColumn,
      CS.layoutCentered,
      CS.textLight,
    )}
  >
    <h3>{t`Here's where your results will appear`}</h3>
  </div>
);

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
}) => (
  <div
    className={cx(
      className,
      QueryBuilderS.Loading,
      CS.flex,
      CS.flexColumn,
      CS.layoutCentered,
      { [QueryBuilderS.LoadingHidden]: hidden },
    )}
  >
    <RunButtonWithTooltip
      className={cx(CS.py2, CS.px3, CS.shadowed)}
      circular
      compact
      result={result}
      hidden={!isRunnable || hidden}
      isRunning={isRunning}
      isDirty={isResultDirty}
      onRun={() => runQuestionQuery({ ignoreCache: true })}
      onCancel={() => cancelQuery()}
    />
  </div>
);
