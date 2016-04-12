import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import Sidebar from "../components/Sidebar.jsx";
import SidebarLayout from "../components/SidebarLayout.jsx";

import cx from "classnames";

import * as questionsActions from "../questions";
import { getSections, getTopics, getLabels } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      sections: getSections(state),
      topics:  getTopics(state),
      labels: getLabels(state)
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
        this.props.selectSection(this.props.params.section, this.props.params.slug);
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
