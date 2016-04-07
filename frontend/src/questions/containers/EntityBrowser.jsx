import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import QuestionsSidebar from "../components/QuestionsSidebar.jsx";
import SidebarLayout from "../components/SidebarLayout.jsx";

import cx from "classnames";

import * as questionsActions from "../duck";
import { getSections, getTopics, getLabels, getSearchText, getQuestionItemsFilteredBySearchText } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      sections: getSections(state),
      topics:  getTopics(state),
      labels: getLabels(state),
      questions: getQuestionItemsFilteredBySearchText(state),
      searchText: getSearchText(state),

      name: "foo",
      selectedCount: 0
  }
}

@connect(mapStateToProps, questionsActions)
export default class EntityBrowser extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {
    };

    componentWillMount() {
        this.props.selectQuestionSection(this.props.params.section, this.props.params.slug);
    }

    componentWillReceiveProps(newProps) {
        console.log(newProps.params)
        if (this.props.params.section !== newProps.params.section || this.props.params.slug !== newProps.params.slug) {
            this.props.selectQuestionSection(newProps.params.section, newProps.params.slug);
        }
    }

    render() {
        console.log(this.props);
        return (
            <SidebarLayout
                className={cx("spread")}
                sidebar={<QuestionsSidebar {...this.props} children={undefined}/>}
            >
                {this.props.children}
            </SidebarLayout>
        );
    }
}
