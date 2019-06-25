/* @flow weak */

import React, { Component } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import VisualizationError from "./VisualizationError";
import VisualizationResult from "./VisualizationResult";

import Utils from "metabase/lib/utils";

import cx from "classnames";

import Question from "metabase-lib/lib/Question";
import type { Database } from "metabase/meta/types/Database";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type { DatasetQuery } from "metabase/meta/types/Card";
import type { ParameterValues } from "metabase/meta/types/Parameter";

type Props = {
  question: Question,
  originalQuestion: Question,
  result?: Object,
  databases?: Database[],
  tableMetadata?: TableMetadata,
  tableForeignKeys?: [],
  tableForeignKeyReferences?: {},
  onUpdateVisualizationSettings: any => void,
  onReplaceAllVisualizationSettings: any => void,
  onOpenChartSettings: any => void,
  cellIsClickableFn?: any => void,
  cellClickedFn?: any => void,
  isRunning: boolean,
  isRunnable: boolean,
  isAdmin: boolean,
  isResultDirty: boolean,
  runQuestionQuery: any => void,
  cancelQuery?: any => void,
  className: string,
};

type State = {
  lastRunDatasetQuery: DatasetQuery,
  lastRunParameterValues: ParameterValues,
  warnings: string[],
};

export default class QueryVisualization extends Component {
  props: Props;
  state: State;

  constructor(props, context) {
    super(props, context);
    this.state = this._getStateFromProps(props);
  }

  static defaultProps = {
    // NOTE: this should be more dynamic from the backend, it's set based on the query lang
    maxTableRows: 2000,
  };

  _getStateFromProps(props) {
    return {
      lastRunDatasetQuery: Utils.copy(props.question.query().datasetQuery()),
      lastRunParameterValues: Utils.copy(props.parameterValues),
    };
  }

  componentWillReceiveProps(nextProps) {
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

  render() {
    const { className, question, isRunning, result } = this.props;
    let viz;

    if (!result) {
      viz = <VisualizationEmptyState className="spread" />;
    } else {
      const error = result.error;

      if (error) {
        viz = (
          <VisualizationError
            className="spread"
            error={error}
            card={question.card()}
            duration={result.duration}
          />
        );
      } else if (result.data) {
        viz = (
          <VisualizationResult
            {...this.props}
            className="spread"
            lastRunDatasetQuery={this.state.lastRunDatasetQuery}
            onUpdateWarnings={warnings => this.setState({ warnings })}
            showTitle={false}
          />
        );
      }
    }

    return (
      <div className={cx(className, "relative")}>
        {isRunning && (
          <div className="Loading spread flex flex-column layout-centered text-brand z2">
            <LoadingSpinner />
            <h2 className="Loading-message text-brand text-uppercase my3">
              {t`Doing science`}...
            </h2>
          </div>
        )}
        <div
          className={cx("spread Visualization z1", {
            "Visualization--errors": result && result.error,
            "Visualization--loading": isRunning,
          })}
        >
          {viz}
        </div>
      </div>
    );
  }
}

export const VisualizationEmptyState = ({ className }) => (
  <div className={cx(className, "flex flex-column layout-centered text-light")}>
    <h1>{t`If you give me some data I can show you something cool. Run a Query!`}</h1>
  </div>
);
