/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import { Component } from "react";

import { defer } from "metabase/lib/promise";
import { runQuestionQuery } from "metabase/services";

const propTypes = {
  question: PropTypes.object,
  children: PropTypes.func,
  onLoad: PropTypes.func,
  keepPreviousWhileLoading: PropTypes.bool,
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
export class QuestionResultLoader extends Component {
  state = {
    results: null,
    loading: false,
    error: null,
  };

  UNSAFE_componentWillMount = () => {
    this._reload();
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    const { question, onLoad, keepPreviousWhileLoading } = nextProps;
    // if the question is different, we need to do a fresh load
    if (question && !question.isEqual(this.props.question)) {
      this._loadResult(question, onLoad, keepPreviousWhileLoading);
    }
  }

  async _loadResult(question, onLoad, keepPreviousWhileLoading) {
    const { collectionPreview } = this.props;

    // we need to have a question for anything to happen
    if (question) {
      try {
        // set up a defer for cancelation
        this._cancelDeferred = defer();

        // begin the request, set cancel in state so the query can be canceled
        this.setState(prev => ({
          loading: true,
          results: keepPreviousWhileLoading ? prev.results : null,
          error: null,
        }));

        const results = await runQuestionQuery(question, {
          cancelDeferred: this._cancelDeferred,
          collectionPreview,
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
    const { question, onLoad, keepPreviousWhileLoading } = this.props;
    this._loadResult(question, onLoad, keepPreviousWhileLoading);
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

QuestionResultLoader.defaultProps = {
  keepPreviousWhileLoading: false,
};

QuestionResultLoader.propTypes = propTypes;

export default QuestionResultLoader;
