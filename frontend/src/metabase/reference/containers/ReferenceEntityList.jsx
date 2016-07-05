/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import S from "metabase/components/List.css";
import List from "metabase/components/List.jsx";
import Icon from "metabase/components/Icon.jsx";
import Item from "metabase/components/Item.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";


import {
    getSection,
    getEntities
} from "../selectors";

import * as metadataActions from "metabase/dashboard/metadata";

const mapStateToProps = (state, props) => ({
    onChangeLocation: props.onChangeLocation,
    section: getSection(state),
    entities: getEntities(state)
});

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceEntityList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entities: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired
    };

    componentWillMount() {
        this.props.fetchDatabases();
    }

    render() {
        const {
            entities,
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
                { Object.keys(entities).length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <List>
                            { Object.values(entities).map(entity =>
                                <li className="relative" key={entity.id}>
                                    <Item
                                        id={entity.id}
                                        name={entity.name}
                                        description={entity.description}
                                        url="test"
                                        icon="star"
                                    />
                                </li>
                            )}
                        </List>
                    </div>
                    :
                    <div className={S.empty}>
                      <EmptyState message={empty.message} icon={empty.icon} />
                    </div>
                }
            </div>
        )
    }
}
