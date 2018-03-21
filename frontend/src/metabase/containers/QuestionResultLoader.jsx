import React from "react";
import { defer } from "metabase/lib/promise";

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
  state = {
    result: null,
    cancel: null,
  };

  componentWillMount() {
    this._loadResult(this.props.question);
  }

  componentWillReceiveProps(nextProps) {
    // if the question is different, we need to do a fresh load, check the
    // difference by comparing the URL we'd generate for the question
    if (nextProps.question && nextProps.question.getUrl() !== this.props.question && this.props.question.getUrl()) {
      this._loadResult(nextProps.question);
    }
  }

  /*
   * load the result by calling question.apiGetResults
   */
  async _loadResult(question) {
    // we need to have a question for anything to happen
    if (question) {
      // set up a defer for cancelation
      let cancelDeferred = defer();

      // begin the request, set cancel in state so the query can be canceled
      this.setState({ cancel: cancelDeferred, result: null });

      // call apiGetResults and pass our cancel to allow for cancelation
      const result = await question.apiGetResults({ cancelDeferred });

      // setState with our result, remove our cancel since we've finished
      this.setState({ cancel: null, result });
    } else {
      // if there's not a question we can't do anything so go back to our initial
      // state
      this.setState({ cancel: null, result: null });
    }
  }

  /*
   * a function to pass to the child to allow the component to call
   * load again
   */
  _reload = () => {
    this._loadResult(this.props.question);
  };

  /*
   * a function to pass to the child to allow the component to interrupt
   * the query
   */
  _cancel = () => {
    // we only want to do things if cancel has been set
    if (this.state.cancel) {
      // call our cancel to cancel the query
      this.state.cancel();
      // cancel our cancel...
      this.setState({ cancel: null });
    }
  };

  render() {
    const { result } = this.state;
    return this.props.children({
      cancel: this._cancel,
      reload: this._reload,
      result,
    });
  }
}

export default QuestionResultLoader;
