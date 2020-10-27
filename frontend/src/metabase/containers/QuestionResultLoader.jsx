/* @flow */

import React from "react";
import { defer } from "metabase/lib/promise";

import type { Dataset } from "metabase-types/types/Dataset";
import type { RawSeries } from "metabase-types/types/Visualization";

import Question from "metabase-lib/lib/Question";

export type ChildProps = {
  loading: boolean,
  error: ?any,
  results: ?(Dataset[]),
  result: ?Dataset,
  rawSeries: ?RawSeries,
  cancel: () => void,
  reload: () => void,
};

type OnLoadCallback = (results: ?(Dataset[])) => void;

type Props = {
  question: ?Question,
  children?: (props: ChildProps) => React$Element<any>,
  onLoad?: OnLoadCallback,
};

type State = {
  results: ?(Dataset[]),
  loading: boolean,
  error: ?any,
};

/*
 * Question result loader
 *
 * Handle runninng, canceling, and reloading Question results
 *
 * @example
 * <QuestionResultLoader question={question}>
 * { ({ result, cancel, reload }) =>
 *     <div>
 *       { result && (<Visualization ... />) }
 *
 *       <a onClick={() => reload()}>Reload this please</a>
 *       <a onClick={() => cancel()}>Changed my mind</a>
 *     </div>
 * }
 * </QuestionResultLoader>
 *
 */
export class QuestionResultLoader extends React.Component {
  props: Props;
  state: State = {
    results: null,
    loading: false,
    error: null,
  };

  _cancelDeferred: ?() => void;

  componentWillMount() {
    this._loadResult(this.props.question, this.props.onLoad);
  }

  componentWillReceiveProps(nextProps: Props) {
    // if the question is different, we need to do a fresh load
    if (
      nextProps.question &&
      !nextProps.question.isEqual(this.props.question)
    ) {
      this._loadResult(nextProps.question, nextProps.onLoad);
    }
  }

  /*
   * load the result by calling question.apiGetResults
   */
  async _loadResult(question: ?Question, onLoad: ?OnLoadCallback) {
    // we need to have a question for anything to happen
    if (question) {
      try {
        // set up a defer for cancelation
        this._cancelDeferred = defer();

        // begin the request, set cancel in state so the query can be canceled
        this.setState({ loading: true, results: null, error: null });

        // call apiGetResults and pass our cancel to allow for cancelation
        const results: Dataset[] = await question.apiGetResults({
          cancelDeferred: this._cancelDeferred,
        });

        // setState with our result, remove our cancel since we've finished
        this.setState({ loading: false, results });

        // handle onLoad prop
        if (onLoad) {
          setTimeout(() => onLoad && onLoad(results));
        }
      } catch (error) {
        this.setState({ loading: false, error });
      }
    } else {
      // if there's not a question we can't do anything so go back to our initial
      // state
      this.setState({ loading: false, results: null, error: null });
    }
  }

  /*
   * a function to pass to the child to allow the component to call
   * load again
   */
  _reload = () => {
    this._loadResult(this.props.question, this.props.onLoad);
  };

  /*
   * a function to pass to the child to allow the component to interrupt
   * the query
   */
  _cancel = () => {
    // we only want to do things if cancel has been set
    if (this.state.loading) {
      // set loading false
      this.setState({ loading: false });
      // call our _cancelDeferred to cancel the query
      if (this._cancelDeferred) {
        this._cancelDeferred();
      }
    }
  };

  render() {
    const { question, children } = this.props;
    const { results, loading, error } = this.state;
    return (
      children &&
      children({
        results,
        result: results && results[0],
        // convienence for <Visualization /> component. Only support single series for now
        rawSeries:
          question && results
            ? [{ card: question.card(), data: results[0].data }]
            : null,
        loading,
        error,
        cancel: this._cancel,
        reload: this._reload,
      })
    );
  }
}

export default QuestionResultLoader;
