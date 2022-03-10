/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import ErrorMessage from "metabase/components/ErrorMessage";

import VisualizationError from "./VisualizationError";
import VisualizationResult from "./VisualizationResult";
import Warnings from "./Warnings";
import RunButtonWithTooltip from "./RunButtonWithTooltip";

import Utils from "metabase/lib/utils";

import cx from "classnames";

import { HARD_ROW_LIMIT } from "metabase/lib/query";

export default class QueryVisualization extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = this._getStateFromProps(props);
  }

  static defaultProps = {
    // NOTE: this should be more dynamic from the backend, it's set based on the query lang
    maxTableRows: HARD_ROW_LIMIT,
  };

  _getStateFromProps(props) {
    return {
      lastRunDatasetQuery: Utils.copy(props.question.query().datasetQuery()),
      lastRunParameterValues: Utils.copy(props.parameterValues),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    // whenever we are told that we are running a query lets update our understanding of the "current" query
    if (nextProps.isRunning) {
      this.setState(this._getStateFromProps(nextProps));
    }
  }

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
      validationError,
    } = this.props;

    return (
      <div className={cx(className, "relative stacking-context")}>
        {isRunning ? <VisualizationRunningState className="spread z2" /> : null}
        <VisualizationDirtyState
          {...this.props}
          hidden={!isResultDirty || isRunning || isNativeEditorOpen}
          className="spread z2"
        />
        {!isObjectDetail && (
          <Warnings
            warnings={this.state.warnings}
            className="absolute top right mt2 mr2 z2"
            size={18}
          />
        )}
        <div
          className={cx("spread Visualization z1", {
            "Visualization--errors": result && result.error,
            "Visualization--loading": isRunning,
          })}
        >
          {validationError ? (
            <ErrorMessage
              title={t`Something's wrong with your question`}
              message={validationError.message}
            />
          ) : result && result.error ? (
            <VisualizationError
              className="spread"
              error={result.error}
              via={result.via}
              card={question.card()}
              duration={result.duration}
            />
          ) : result && result.data ? (
            <VisualizationResult
              {...this.props}
              className="spread"
              lastRunDatasetQuery={this.state.lastRunDatasetQuery}
              onUpdateWarnings={this.handleUpdateWarnings}
            />
          ) : !isRunning ? (
            <VisualizationEmptyState className="spread" />
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

export const VisualizationRunningState = ({ className }) => (
  <div
    className={cx(
      className,
      "Loading flex flex-column layout-centered text-brand",
    )}
  >
    <LoadingSpinner />
    <h2 className="Loading-message text-brand text-uppercase my3">
      {t`Doing science`}...
    </h2>
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
    className={cx(className, "Loading flex flex-column layout-centered", {
      "Loading--hidden pointer-events-none": hidden,
    })}
  >
    <RunButtonWithTooltip
      className="shadowed"
      circular
      compact
      py={2}
      px={3}
      result={result}
      hidden={!isRunnable || hidden}
      isRunning={isRunning}
      isDirty={isResultDirty}
      onRun={() => runQuestionQuery({ ignoreCache: true })}
      onCancel={() => cancelQuery()}
    />
  </div>
);
