import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import { getQuestion } from "metabase/questions/selectors";

import {
  fetchQuestion,
  genUrlBasedQuestion,
} from "metabase/questions/questions";

const mapStateToProps = state => ({
  question: getQuestion(state),
  result: state.questions.currentQuestionResults && state.questions.currentQuestionResults
});

const getURL = location => location.pathname + location.search + location.hash;

/*
 * Question handler to handle fetching and URL updates when working with questions for
 * a particular route
 */
class QuestionHandler extends React.Component {

  static defaultProps = {
    fetchResult: true
  }

  componentWillMount() {
    const { params, location } = this.props;

    // if we're working with a card ID,
    // load up the question from the API
    if (params.cardId) {
      this._fetchSavedQuestion();
    } else if (location.hash) {
      // we're working with a URL based query that's in the URL hash
      // generate a new Question object
      this._fetchUrlQuestion();
    }
  }

  // for now just hack this so that we fully refresh the page
  componentWillReceiveProps(nextProps) {
    if (
      nextProps.location.action === "POP" &&
      getURL(nextProps.location) !== getURL(this.props.location)
    ) {
      window.location.reload();
    } else if (
      nextProps.location.action === "PUSH" &&
      getURL(nextProps.location) !== getURL(this.props.location) &&
      nextProps.question &&
      getURL(nextProps.location) !== nextProps.question.getUrl()
    ) {
      window.location.reload();
    }
  }

  _fetchSavedQuestion() {
    const { dispatch, params } = this.props;
    dispatch(fetchQuestion(
      params.cardId,
      this.props.fetchResult
    ));
  }

  _fetchUrlQuestion() {
    const { dispatch, location } = this.props;
    dispatch(genUrlBasedQuestion(location.hash, this.props.fetchResult));
  }

  render() {
    const { question, result } = this.props

    if(question) {
      return this.props.children({
        question,
        result
      });
    } else {
      return (<div>Loading</div>)
    }

  }
}

export default withRouter(connect(mapStateToProps)(QuestionHandler));
