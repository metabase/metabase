import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import QuestionsList from "../components/QuestionsList.jsx";

import * as questionsActions from "../duck";
import { getSections, getTopics, getLabels, getSearchText, getChecked, getQuestionItemsFilteredBySearchText } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      sections: getSections(state),
      topics:  getTopics(state),
      labels: getLabels(state),
      questions: getQuestionItemsFilteredBySearchText(state),
      searchText: getSearchText(state),

      name: "foo",
      selectedCount: 0,

      checked: getChecked(state)
  }
}

@connect(mapStateToProps, questionsActions)
export default class EntityList extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        console.log("PROPS", this.props)
        return (
            <QuestionsList {...this.props} />
        );
    }
}
