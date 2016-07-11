/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import S from "metabase/components/List.css";
import List from "metabase/components/List.jsx";
import Item from "metabase/components/Item.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";

import {
    getSection,
    getData,
    getError,
    getLoading
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";

const mapStateToProps = (state, props) => ({
    section: getSection(state),
    entity: getData(state) || {},
    loading: getLoading(state),
    error: getError(state)
});

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityItem extends Component {
    static propTypes = {
        entity: PropTypes.object
    };

    render() {
        const {
            section,
            entity,
            error,
            loading
        } = this.props;

        // TODO: style this properly, currently just reusing list style
        return (
            <div className="full">
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '40px',
                        backgroundColor: '#6CAFED'
                    }}
                >
                </div>
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        {entity.display_name || entity.name}
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                { () =>
                    <div className="wrapper wrapper--trim">
                        <List>
                            <li className="relative">
                                <Item
                                    name="Description"
                                    description={entity.description || 'No description'}
                                />
                            </li>
                            { entity.display_name ?
                                <li className="relative">
                                    <Item
                                        name="Actual name in database"
                                        description={entity.name}
                                    />
                                </li> :
                                null
                            }
                            <li className="relative">
                                <Item
                                    name={`Why this ${section.type} is interesting`}
                                    description={entity.insights || 'No description'}
                                />
                            </li>
                            <li className="relative">
                                <Item
                                    name={`Things to be aware of about this ${section.type}`}
                                    description={entity.facts || 'No description'}
                                />
                            </li>
                        </List>
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}
