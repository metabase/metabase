/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import Sidebar from "../components/Sidebar.jsx";
import SidebarLayout from "metabase/components/SidebarLayout.jsx";

import * as questionsActions from "../questions";
import * as labelsActions from "../labels";
import { getSections, getLabels, getLabelsLoading, getLabelsError } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      sections:         getSections(state),
      labels:           getLabels(state),
      labelsLoading:    getLabelsLoading(state),
      labelsError:      getLabelsError(state),
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
        children:       PropTypes.any.isRequired,

        sections:       PropTypes.array.isRequired,
        labels:         PropTypes.array.isRequired,
        labelsLoading:  PropTypes.bool.isRequired,
        labelsError:    PropTypes.any,
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
                className="flex-full"
                sidebar={<Sidebar {...this.props}/>}
            >
                {this.props.children}
            </SidebarLayout>
        );
    }
}
