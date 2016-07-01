/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import S from "../components/List.css";
import List from "../components/List.jsx";
import Icon from "metabase/components/Icon.jsx";


import {
    getSection
} from "../selectors";

const mapStateToProps = (state, props) => ({
    section: getSection(state)
});

const mapDispatchToProps = {};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceEntityList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired
    };

    render() {
        const {
            style, section
        } = this.props;
        return (
            <div style={style} className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        {section.name}
                    </div>
                </div>
            </div>
        )
    }
}
