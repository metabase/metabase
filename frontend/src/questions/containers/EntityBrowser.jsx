/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import Sidebar from "../components/Sidebar.jsx";
import SidebarLayout from "../components/SidebarLayout.jsx";

import cx from "classnames";

import * as questionsActions from "../questions";
import * as labelsActions from "../labels";
import { getSections, getTopics, getLabels } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      sections: getSections(state),
      topics:  getTopics(state),
      labels: getLabels(state)
  }
}

const mapDispatchToProps = {
    ...questionsActions,
    ...labelsActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityBrowser extends Component {
    static propTypes = {
        params:         PropTypes.object.isRequired,
        selectSection:  PropTypes.func.isRequired,
        loadLabels:     PropTypes.func.isRequired,
        children:       PropTypes.any.isRequired
    };

    componentWillMount() {
        this.props.selectSection(this.props.params.section, this.props.params.slug);
        this.props.loadLabels();
    }

    componentWillReceiveProps(newProps) {
        if (this.props.params.section !== newProps.params.section || this.props.params.slug !== newProps.params.slug) {
            this.props.selectSection(newProps.params.section, newProps.params.slug);
        }
    }

    render() {
        return (
            <SidebarLayout
                className={cx("spread")}
                sidebar={<Sidebar {...this.props} children={undefined}/>}
            >
                {this.props.children}
            </SidebarLayout>
        );
    }
}
