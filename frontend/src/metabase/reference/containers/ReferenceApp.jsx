/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from 'react';
import ReactDom from 'react-dom';
import { connect } from 'react-redux';

//TODO: a lot of components here share code with components from the /questions page and can be refactored out into shared components
// though I'm keeping things separate for now to minimize conflicts with some of the large refactoring efforts in the pipeline
import Sidebar from '../components/Sidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';

import * as referenceActions from '../reference';
import { getSections } from '../selectors';

const mapStateToProps = (state, props) => ({
    sections: getSections(state)
});

const mapDispatchToProps = {
    ...referenceActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceApp extends Component {
    static propTypes = {
        params:         PropTypes.object.isRequired,
        selectSection:  PropTypes.func.isRequired,
        children:       PropTypes.any.isRequired,

        sections:       PropTypes.array.isRequired
    };

    componentWillMount() {
        this.props.selectSection(this.props.params.section);
    }

    componentWillReceiveProps(newProps) {
        if (this.props.params.section !== newProps.params.section) {
            this.props.selectSection(newProps.params.section);
        }
    }

    render() {
        return (
            <SidebarLayout
                sidebar={<Sidebar {...this.props} children={undefined} />}
            >
                {this.props.children}
            </SidebarLayout>
        )
    }
}
