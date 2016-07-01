/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import S from "../components/List.css";
import List from "../components/List.jsx";
import Icon from "metabase/components/Icon.jsx";
import EmptyState from "../components/EmptyState.jsx";


import {
    getSection,
    getEntityIds
} from "../selectors";

import * as metadataActions from "metabase/dashboard/metadata";

const mapStateToProps = (state, props) => ({
    onChangeLocation: props.onChangeLocation,
    section: getSection(state),
    entityIds: getEntityIds(state)
});

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceEntityList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entityIds: PropTypes.array.isRequired,
        section: PropTypes.object.isRequired
    };

    componentWillMount() {
        this.props.fetchDatabases();
    }

    render() {
        const {
            entityIds,
            style,
            section
        } = this.props;

        const empty = {
            icon: 'mine',
            message: 'You haven\'t added any databases yet.'
        };
        return (
            <div style={style} className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        {section.name}
                    </div>
                </div>
                { () => entityIds.length > 0 ? (
                        <div className="wrapper wrapper--trim">
                            <List entityType={section.id} entityIds={entityIds} />
                        </div>
                    ) : (
                        <div className={S.empty}>
                          <EmptyState message={empty.message} icon={empty.icon} />
                        </div>
                    )
                }
            </div>

        )
    }
}
