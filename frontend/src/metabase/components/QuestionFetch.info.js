import React from "react";
import { connect } from "react-redux";

import { fetchQuestion } from "metabase/questions/questions";

import { getQuestion } from "metabase/questions/selectors";

const mapStateToProps = state => ({
  question: getQuestion(state),
});

const mapDispatchToProps = {
  fetchQuestion,
};

@connect(mapStateToProps, mapDispatchToProps)
class QuestionFetcher extends React.Component {
  componentDidMount() {
    fetchQuestion(1);
  }
  render() {
    return <div>Test</div>;
  }
}

export const component = QuestionFetcher;

export const description = `
  An example of how to fetch questions
`;

export const examples = {
  "": <QuestionFetcher />,
};
