/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import CS from "metabase/css/core";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";

import RunButtonWithTooltip from "./RunButtonWithTooltip";
import { VisualizationError } from "./VisualizationError";
import VisualizationResult from "./VisualizationResult";
import Warnings from "./Warnings";

export default class QueryVisualization extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  static defaultProps = {
    // NOTE: this should be more dynamic from the backend, it's set based on the query lang
    maxTableRows: HARD_ROW_LIMIT,
  };

  runQuery = () => {
    const { isResultDirty } = this.props;
    // ignore the cache if we're hitting "Refresh" (which we only show if isResultDirty = false)
    this.props.runQuestionQuery({ ignoreCache: !isResultDirty });
  };

  handleUpdateWarnings = warnings => {
    this.setState({ warnings });
  };

  render() {
    const {
      className,
      question,
      isRunning,
      isObjectDetail,
      isResultDirty,
      isNativeEditorOpen,
      result,
      loadingMessage,
    } = this.props;

    return (
      <div
        className={cx(
          className,
          CS.relative,
          CS.stackingContext,
          CS.fullHeight,
        )}
      >
        {isRunning ? (
          <VisualizationRunningState
            className={cx(CS.spread, CS.z2)}
            loadingMessage={loadingMessage}
          />
        ) : null}
        <VisualizationDirtyState
          {...this.props}
          hidden={!isResultDirty || isRunning || isNativeEditorOpen}
          className={cx(CS.spread, CS.z2)}
        />
        {!isObjectDetail && (
          <Warnings
            warnings={this.state.warnings}
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
          data-testid="visualization-root"
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
              {...this.props}
              className={CS.spread}
              onUpdateWarnings={this.handleUpdateWarnings}
            />
          ) : !isRunning ? (
            <VisualizationEmptyState className={CS.spread} />
          ) : null}
        </div>
      </div>
    );
  }
}

export const VisualizationEmptyState = ({ className }) => (
  <div className={cx(className, "flex flex-column layout-centered text-light")}>
    <h3>{t`Here's where your results will appear`}</h3>
  </div>
);

export const VisualizationRunningState = ({
  className = "",
  loadingMessage,
}) => (
  <div
    className={cx(
      className,
      QueryBuilderS.Loading,
      CS.flex,
      "flex-column",
      CS.layoutCentered,
      CS.textBrand,
    )}
  >
    <LoadingSpinner />
    <h2 className="text-brand text-uppercase my3">{loadingMessage}</h2>
  </div>
);

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
      "flex-column layout-centered",
      {
        [QueryBuilderS.LoadingHidden]: hidden,
        "pointer-events-none": hidden,
      },
    )}
  >
    <RunButtonWithTooltip
      className="py2 px3 shadowed"
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
