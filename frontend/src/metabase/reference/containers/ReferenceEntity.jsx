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
    getData,
    getError,
    getLoading
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";

const mapStateToProps = (state, props) => ({
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
            entity,
            error,
            loading
        } = this.props;

        // TODO: style this properly, currently just reusing list style
        return (
            <div className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        {entity.display_name || entity.name}
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                { () =>
                    <div className="wrapper wrapper--trim">
                        <List>
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
                                    name="Description"
                                    description={entity.description || 'No description'}
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
