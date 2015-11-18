import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import SavedQuestions from "../components/SavedQuestions.jsx";
import { savedQuestionsSelectors } from "../selectors";

@connect(savedQuestionsSelectors)
export default class SavedQuestionsApp extends Component {
    render() {
        return <SavedQuestions {...this.props} />;
    }
}
